import type { ActiveWorkspaceView, Place, RegionName, TourDay } from '../types';
import type { SavedTemplate } from '../components/ItineraryBoard';

export interface PersistedPlannerState {
  tourTitle: string;
  days: TourDay[];
  activeDayId: string | null;
  activeRegion: RegionName | 'Tümü';
  activeCity: string;
  activeCategory: string;
  customPlaces: Place[];
  editedPlaces: Record<string, Place>;
  deletedPlaceIds: string[];
  customCities: string[];
  savedTemplates: SavedTemplate[];
  dirtyCities: string[];
}

export type { ActiveWorkspaceView };
