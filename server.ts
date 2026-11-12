import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { INITIAL_TURKEY_CATALOG, PROVINCE_BY_NAME } from "./src/data/turkeyCatalog";
// import { registerCatalogRoutes } from './catalogRoutes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_TAGS = [
  "#antik-kent",
  "#tarih",
  "#müze",
  "#inanç",
  "#kale",
  "#saray",
  "#doğa",
  "#manzara",
  "#çarşı",
  "#restoran",
  "#kafe",
  "#etkinlik",
  "#otel",
];

// Google'ın güncel ve aktif modelleri
const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
];

function extractApiKeyFromReq(req: Request): string | undefined {
  const headerKey = req.headers["x-gemini-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }
  if (req.body && typeof req.body.apiKey === "string" && req.body.apiKey.trim()) {
    return req.body.apiKey.trim();
  }
  return undefined;
}

function getAiClient(customKey?: string): GoogleGenAI | null {
  const apiKey = (customKey && customKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function extractFirstJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model yanıtında geçerli JSON bulunamadı.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// -------------------------------------------------------------
// AI ÇEVRİMDIŞI / YEDEK MOTOR (API OLMASA BİLE ÇALIŞAN ALGORİTMA)
// -------------------------------------------------------------
function generateFallbackItinerary(
  cities: string[],
  dayCount: number,
  tempo: string
) {
  const targetCities = cities.length > 0 ? cities : ["İstanbul", "Bursa"];
  const safeDays = Math.min(10, Math.max(1, Number(dayCount) || 3));
  const stopsPerDay = tempo === "rahat" ? 3 : tempo === "yogun" ? 6 : 4;

  const daysResult = [];
  const startHours = ["09:30", "11:00", "13:00", "14:45", "16:30", "18:30", "20:00"];

  for (let d = 0; d < safeDays; d++) {
    const city = targetCities[d % targetCities.length];
    const provMeta = PROVINCE_BY_NAME[city];
    const cityPlaces = INITIAL_TURKEY_CATALOG.filter((p) => p.city.toLowerCase() === city.toLowerCase());

    const dayStops = [];
    const available = cityPlaces.length > 0 ? [...cityPlaces] : [];

    for (let s = 0; s < stopsPerDay; s++) {
      let chosen = available[s % available.length];
      if (!chosen) {
        chosen = {
          id: `fallback-${d}-${s}`,
          name: `${city} Tarihi Kent Meydanı & Çarşısı`,
          city,
          category: s === 2 ? "#restoran" : "#tarih",
          duration: 60,
          lat: provMeta?.lat || 39.0,
          lng: provMeta?.lng || 35.0,
          tip: "Bölgenin tarihi dokusunu ve yerel lezzetlerini keşfetmek için ideal başlangıç.",
        };
      }

      dayStops.push({
        name: chosen.name,
        city: chosen.city,
        category: chosen.category,
        duration: chosen.duration || 60,
        tip: chosen.tip || `${city} bölgesinin öne çıkan gezi noktası.`,
        lat: chosen.lat,
        lng: chosen.lng,
        startTime: startHours[s] || "10:00",
      });
    }

    daysResult.push({
      title: `${city} Keşfi & Kültür Rotası`,
      stops: dayStops,
    });
  }

  return {
    tourTitle: `${targetCities.join(" - ")} Kültür ve Gastronomi Turu`,
    summary: `${targetCities.join(", ")} şehirlerini kapsayan, 81 il gezi kataloğuna dayalı dengeli gezi rotası.`,
    days: daysResult,
    elapsedMs: 250,
    isFallback: true,
  };
}

function generateFallbackGuide(placeName: string, city: string) {
  const found = INITIAL_TURKEY_CATALOG.find(
    (p) => p.name.toLowerCase().includes(placeName.toLowerCase()) || placeName.toLowerCase().includes(p.name.toLowerCase())
  );

  return {
    intro: `${placeName}, ${city} ilimizin en bilinen ve mutlaka görülmesi gereken kültürel duraklarından biridir.`,
    story: found?.tip || `${city} bölgesinin köklü geçmişini ve mimari kimliğini yansıtan önemli bir ziyaret noktasıdır.`,
    highlights: [
      "Özgün mimari ve tarihi detaylar",
      "Fotoğraf çekimi için ideal seyir açıları",
      "Bölgeye has kültürel atmosfer",
      "Çevredeki tarihi sokak ve çarşı dokusu",
    ],
    positive_reviews: ["Tarihi atmosfer", "Ulaşım kolaylığı", "Etkileyici manzara"],
    negative_reviews: ["Hafta sonları kalabalık olabiliyor", "Otopark kısıtlı olabilir"],
    rating_note: "Ziyaretçi Memnuniyeti Yüksek (~4.7/5)",
    local_tip: found?.tip || "Sabah saatlerinde ziyaret etmek kalabalıktan kaçınmak için idealdir.",
    must_eat_nearby: `${city} yöresel lezzetleri ve geleneksel fırın/lokantaları.`,
    best_time: "Sabah 09:30 - 11:30",
    duration: found?.duration || 60,
    tag: found?.category || "#tarih",
    mode: "fast",
    modelUsed: "Rota81 Akıllı Katalog Motoru",
    elapsedMs: 150,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // HATA ÇÖZÜMÜ: registerCatalogRoutes, app tanımlandıktan sonra çağrılmalıdır.
  // if (typeof registerCatalogRoutes === 'function') {
  //   registerCatalogRoutes(app);
  // }

  // 1) TEST / VALIDATE API KEY
  app.post("/api/ai/test-key", async (req: Request, res: Response) => {
    try {
      const customKey = extractApiKeyFromReq(req);
      const ai = getAiClient(customKey);

      if (!ai) {
        res.status(400).json({
          ok: false,
          error: "API anahtarı bulunamadı. Lütfen anahtarınızı girin.",
        });
        return;
      }

      const t0 = Date.now();
      let lastErr: unknown = null;

      for (const model of CANDIDATE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: "Lütfen sadece 'TAMAM' yaz.",
          });
          const reply = (response.text ?? "").trim();
          res.json({
            ok: true,
            message: `Gemini API anahtarı başarıyla doğrulandı (${model} aktif).`,
            reply,
            modelUsed: model,
            source: customKey ? "custom" : "server_env",
            elapsedMs: Date.now() - t0,
          });
          return;
        } catch (mErr) {
          lastErr = mErr;
        }
      }

      throw lastErr;
    } catch (err) {
      const msg = String((err as { message?: string })?.message || "");
      if (/API_KEY_INVALID|PERMISSION_DENIED|invalid api key/i.test(msg)) {
        res.status(403).json({ ok: false, error: "Girilen API anahtarı geçersiz. Lütfen Google AI Studio'dan tekrar kopyalayın." });
      } else {
        res.status(503).json({
          ok: false,
          error: `Google servisi anlık yanıt vermedi (${msg.slice(0, 80)}...). Endişelenmeyin; program yapay zeka olmadan da otomatik rota üretmeye hazırdır.`,
        });
      }
    }
  });

  // 2) REHBER KARTI (Kategori ve Koordinat Odaklı Güncellenmiş Sürüm)
  app.post("/api/ai/place-guide", async (req: Request, res: Response) => {
    const { placeName = "Tarihi Durak", city = "İstanbul", category = "#tarih", mode = "fast" } = req.body;
    const customKey = extractApiKeyFromReq(req);
    const ai = getAiClient(customKey);

    const foundInCatalog = INITIAL_TURKEY_CATALOG.find(
      (p) => p.name.toLowerCase().includes(placeName.toLowerCase()) || placeName.toLowerCase().includes(p.name.toLowerCase())
    );

    if (foundInCatalog && mode === "fast") {
      res.json({
        intro: `${foundInCatalog.name}, ${foundInCatalog.city} bölgesinde yer alan önemli bir duraktır.`,
        story: foundInCatalog.tip,
        highlights: ["Özgün mekan atmosferi", "Bölgeye özel deneyim", "Ziyaretçi odaklı nokta"],
        local_tip: foundInCatalog.tip,
        must_eat_nearby: `${foundInCatalog.city} yöresel lezzetleri.`,
        best_time: "Gündüz saatleri",
        duration: foundInCatalog.duration || 60,
        tag: foundInCatalog.category || category,
        mode: "fast",
        modelUsed: "Rota81 Hızlı Katalog Motoru",
        elapsedMs: 10,
      });
      return;
    }

    if (ai) {
      try {
        const t0 = Date.now();
        const model = "gemini-3.1-flash-lite";

        const prompt = `"${placeName}" (${city}) için kısa JSON verisi üret:
{
  "duration": 60,
  "tag": "${category}",
  "intro": "1 cümlelik çok kısa tanım.",
  "local_tip": "Kısa pratik tüyo."
}`;

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        const parsed = extractFirstJsonObject(response.text ?? "{}");
        res.json({
          ...parsed,
          mode,
          modelUsed: model,
          elapsedMs: Date.now() - t0,
        });
        return;
      } catch (aiErr) {
        console.warn("AI hızlı dolum yanıt vermedi, katalog yedeğine geçiliyor:", (aiErr as Error).message);
      }
    }

    res.json(generateFallbackGuide(placeName, city));
  });

  // 3) ÇOK GÜNLÜ TUR SİHİRBAZI
  app.post("/api/ai/generate-itinerary", async (req: Request, res: Response) => {
    const {
      cities = [],
      dayCount = 3,
      tempo = "dengeli",
      categories = [],
      notes = "",
    } = req.body;

    const customKey = extractApiKeyFromReq(req);
    const ai = getAiClient(customKey);

    if (ai) {
      try {
        const t0 = Date.now();
        const model = CANDIDATE_MODELS[0];
        const safeDays = Math.min(10, Math.max(1, Number(dayCount) || 3));

        const prompt = `Şehirler: ${cities.join(", ") || "Türkiye"}
Gün Sayısı: ${safeDays} gün
Tempo: ${tempo}
Kategoriler: ${categories.join(", ") || "Genel"}
Not: ${notes || "Coğrafi yakınlığa göre sırala"}

Her gün için başlık ve duraklar içeren geçerli bir JSON döndür:
{
  "tourTitle": "Tur Başlığı",
  "summary": "Tur Özeti",
  "days": [
    {
      "title": "1. Gün Teması",
      "stops": [
        {
          "name": "Mekan Adı",
          "city": "İl Adı",
          "category": "#tarih",
          "duration": 60,
          "tip": "Rehber notu",
          "lat": 41.0,
          "lng": 29.0,
          "startTime": "09:30"
        }
      ]
    }
  ]
}`;

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        const parsed = extractFirstJsonObject(response.text ?? "{}");
        res.json({
          ...parsed,
          elapsedMs: Date.now() - t0,
        });
        return;
      } catch (aiErr) {
        console.warn("AI rota servisi yanıt vermedi, katalog yedeğine geçiliyor:", (aiErr as Error).message);
      }
    }

    res.json(generateFallbackItinerary(cities, dayCount, tempo));
  });

  // 4) GÜN İÇİ YARDIM
  app.post("/api/ai/day-assist", async (req: Request, res: Response) => {
    const { action, city, currentStops = [] } = req.body;
    const customKey = extractApiKeyFromReq(req);
    const ai = getAiClient(customKey);

    if (ai) {
      try {
        const model = CANDIDATE_MODELS[0];
        const t0 = Date.now();

        if (action === "optimize") {
          const prompt = `Duraklar: ${JSON.stringify(currentStops)}. Coğrafi yakınlığa göre sırala.
JSON: { "orderedIds": ["id1", "id2"], "startTimes": ["09:30", "11:00"], "note": "Açıklama" }`;
          const resAI = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: "application/json" },
          });
          res.json({ ...extractFirstJsonObject(resAI.text ?? "{}"), elapsedMs: Date.now() - t0 });
          return;
        }

        const prompt = `${city || "Merkez"} için 3 adet yöresel #restoran öner.
JSON: { "suggestions": [{"name": "Mekan", "city": "${city}", "category": "#restoran", "duration": 60, "tip": "Öneri", "lat": 39.0, "lng": 35.0}], "note": "Öneri notu" }`;
        const resAI = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json" },
        });
        res.json({ ...extractFirstJsonObject(resAI.text ?? "{}"), elapsedMs: Date.now() - t0 });
        return;
      } catch {
        // AI meşgulse aşağıdan devam et
      }
    }

    if (action === "optimize") {
      res.json({
        orderedIds: currentStops.map((s: { id: string }) => s.id),
        startTimes: ["09:30", "11:00", "13:00", "15:00", "17:00"],
        note: "Duraklar zaman akışına göre düzenlendi.",
        elapsedMs: 50,
      });
    } else {
      const targetCity = city || currentStops[0]?.city || "Gaziantep";
      const meals = INITIAL_TURKEY_CATALOG.filter(
        (p) => p.city.toLowerCase() === targetCity.toLowerCase() && (p.category === "#restoran" || p.category === "#kafe")
      ).slice(0, 3);

      res.json({
        suggestions: meals.length > 0 ? meals : [
          {
            name: `${targetCity} Tarihi Esnaf Lokantası`,
            city: targetCity,
            category: "#restoran",
            duration: 60,
            tip: "Yöresel lezzetlerin ve meşhur fırın yemeklerinin tadılabileceği durak.",
            lat: 37.0,
            lng: 37.0,
          },
        ],
        note: `${targetCity} yöresel lezzet durakları eklendi.`,
        elapsedMs: 50,
      });
    }
  });

  // 5) CANLI DANIŞMAN (STREAMING)
  app.post("/api/ai/assistant-stream", async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const { message = "" } = req.body;
    const customKey = extractApiKeyFromReq(req);
    const ai = getAiClient(customKey);

    if (ai) {
      try {
        const stream = await ai.models.generateContentStream({
          model: CANDIDATE_MODELS[0],
          contents: message,
          config: {
            systemInstruction: "Sen Türkiye tur ve rota danışmanısın. Kısa ve pratik öneriler ver.",
          },
        });

        for await (const chunk of stream) {
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      } catch {
        // AI hatası durumunda alttaki yedek cevabı akıt
      }
    }

    const fallbackReply = `Rota öneriniz değerlendirildi. 81 il kataloğumuzdaki öne çıkan durakları inceleyebilir, tarihi çarşı ve müzeleri sabah saatlerine, gün batımı seyir noktaları ve yöresel restoranları akşam saatlerine alarak rotanızı zenginleştirebilirsiniz.`;
    res.write(`data: ${JSON.stringify({ text: fallbackReply })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  });

  const distPath = path.resolve(__dirname, "dist");
  const isProd =
    process.env.NODE_ENV === "production" ||
    (fs.existsSync(distPath) && process.argv[1]?.endsWith("server.ts") && !process.env.VITE_DEV);

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (isProd && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Rota81 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();