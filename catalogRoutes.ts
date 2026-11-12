import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';

/**
 * Katalog şehir şehir ayrı dosyalarda saklanır:
 *   catalog-data/47-mardin.json, catalog-data/06-ankara.json ...
 *   catalog-data/index.json  (şehir listesi: dosya adı, kart sayısı, son güncelleme)
 * Her şehir dosyasının içinde "city" alanı bulunur; dosya adından bağımsız okunur.
 */
const CATALOG_DIR = path.join(process.cwd(), 'catalog-data');

function slugify(city: string): string {
  const map: Record<string, string> = {
    ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u',
  };
  const slug = city
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (ch) => map[ch] || ch)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'sehir';
}

function fileNameFor(city: string, plate?: string): string {
  const prefix = plate && /^\d{2}$/.test(plate) ? `${plate}-` : '';
  return `${prefix}${slugify(city)}.json`;
}

function writeJsonAtomic(filePath: string, data: unknown) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

export function registerCatalogRoutes(app: Express) {
  const jsonBody = express.json({ limit: '10mb' });

  // Tüm şehir dosyalarını okur
  app.get('/api/catalog', (_req, res) => {
    try {
      const cities: Record<string, { places: unknown[]; updatedAt?: string }> = {};
      if (fs.existsSync(CATALOG_DIR)) {
        for (const file of fs.readdirSync(CATALOG_DIR)) {
          if (!file.endsWith('.json') || file === 'index.json') continue;
          try {
            const data = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, file), 'utf-8'));
            if (data && typeof data.city === 'string' && Array.isArray(data.places)) {
              cities[data.city] = { places: data.places, updatedAt: data.updatedAt };
            }
          } catch {
            // bozuk dosyayı atla
          }
        }
      }
      res.json({ cities });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Katalog okunamadı.' });
    }
  });

  // Tek bir şehrin kataloğunu yeniden yazar
  app.put('/api/catalog/:city', jsonBody, (req, res) => {
    try {
      const city = String(req.body?.city || req.params.city || '').trim();
      const plate = typeof req.body?.plate === 'string' ? req.body.plate : undefined;
      const rawPlaces: unknown = req.body?.places;

      if (!city || city.length > 80) {
        res.status(400).json({ error: 'Geçersiz şehir adı.' });
        return;
      }
      if (!Array.isArray(rawPlaces) || rawPlaces.length > 20000) {
        res.status(400).json({ error: 'Geçersiz durak listesi.' });
        return;
      }

      const places = rawPlaces.filter(
        (p) => p && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string'
      );

      fs.mkdirSync(CATALOG_DIR, { recursive: true });

      const file = fileNameFor(city, plate);
      const filePath = path.join(CATALOG_DIR, file);

      // Aynı dosya adına başka bir şehir yazılmasını engelle
      if (fs.existsSync(filePath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (existing?.city && existing.city !== city) {
            res.status(409).json({ error: `${file} dosyası başka bir şehre ait.` });
            return;
          }
        } catch {
          // bozuk dosya üzerine yazılabilir
        }
      }

      const updatedAt = new Date().toISOString();
      writeJsonAtomic(filePath, {
        version: 1,
        city,
        plate: plate || null,
        updatedAt,
        count: places.length,
        places,
      });

      // index.json güncelle
      const indexPath = path.join(CATALOG_DIR, 'index.json');
      let index: { version: number; updatedAt: string; cities: Record<string, unknown> } = {
        version: 1,
        updatedAt,
        cities: {},
      };
      try {
        if (fs.existsSync(indexPath)) {
          const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
          if (parsed && typeof parsed.cities === 'object') index = { ...index, ...parsed };
        }
      } catch {
        // index bozuksa yeniden oluşturulur
      }
      index.updatedAt = updatedAt;
      index.cities[city] = { file, plate: plate || null, count: places.length, updatedAt };
      writeJsonAtomic(indexPath, index);

      res.json({ ok: true, file, count: places.length, updatedAt });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Katalog kaydedilemedi.' });
    }
  });
}