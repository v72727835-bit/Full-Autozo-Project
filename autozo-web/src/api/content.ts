import { api } from '../lib/client';

/* ---------- content pages (Terms, Privacy, …) ---------- */
export interface PageBlock {
  type: 'heading' | 'text' | 'image';
  text?: string;
  image?: string;
  alt?: string;
}
export interface ContentPage {
  slug: string;
  title: string;
  blocks: PageBlock[];
  metaDescription?: string;
  updatedAt: string;
}

/** A published content page by its address, or null when there is none. */
export const fetchPage = async (slug: string): Promise<ContentPage | null> => {
  try {
    const { data } = await api.get(`/pages/${encodeURIComponent(slug)}`);
    return data.data as ContentPage;
  } catch {
    return null;
  }
};

/* ---------- third-party ads ---------- */
export type AdPlacement = 'home_top' | 'home_mid' | 'home_bottom' | 'category' | 'sidebar';
export interface Ad {
  id: string;
  title: string;
  image: string;
  targetUrl: string;
  placement: AdPlacement;
}

/** Live ads for a placement (empty on any error, so a slot just stays hidden). */
export const fetchAds = async (placement: AdPlacement): Promise<Ad[]> => {
  try {
    const { data } = await api.get('/ads', { params: { placement } });
    return data.data as Ad[];
  } catch {
    return [];
  }
};

/** Records a click and returns where to open the ad (falls back to the given url). */
export const trackAdClick = async (id: string, fallback: string): Promise<string> => {
  try {
    const { data } = await api.post(`/ads/${id}/click`, {});
    return (data.data as { targetUrl?: string }).targetUrl ?? fallback;
  } catch {
    return fallback;
  }
};
