export type FitMode = "cover" | "contain" | "blur";
export type TransitionStyle = "fade" | "slide" | "none";
export type DisplayMode = "single" | "collection" | "scheduled";
export type ScheduleType = "weekly" | "date_range" | "daily_time";
export type Rotation = 0 | 90 | 180 | 270;

export interface Poster {
  id: string;
  title: string;
  year: string | null;
  rating: string | null;
  runtime: string | null;
  genre: string | null;
  description: string | null;
  image_url: string;
  storage_path: string | null;
  active: boolean;
  created_at: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface CollectionPoster {
  id: string;
  collection_id: string;
  poster_id: string;
  sort_order: number;
  created_at: string;
}

export interface CollectionPosterWithPoster extends CollectionPoster {
  poster: Poster;
}

export interface Display {
  id: string;
  name: string;
  location: string | null;
  active_collection_id: string | null;
  active_poster_id: string | null;
  display_mode: DisplayMode;
  rotation_seconds: number;
  fit_mode: FitMode;
  transition_style: TransitionStyle;
  show_overlay: boolean;
  rotation: Rotation;
  shuffle: boolean;
  sleep_enabled: boolean;
  sleep_time: string | null;
  wake_time: string | null;
  is_online: boolean;
  last_seen: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  display_id: string;
  collection_id: string | null;
  poster_id: string | null;
  name: string;
  schedule_type: ScheduleType | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at: string;
}

export interface DisplayPlaylistCache {
  display: Display;
  posters: Poster[];
  savedAt: number;
}
