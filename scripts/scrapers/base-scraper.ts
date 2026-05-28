/**
 * Base Scraper Module
 *
 * Provides common utilities for scraping real web data to improve accuracy
 * beyond what LLMs can reliably provide (current menus, recent photos, reviews, etc.).
 *
 * Designed to run in GitHub Actions (via Playwright + Docker Chrome).
 *
 * IMPORTANT:
 * - Respect robots.txt and site terms.
 * - Rate limit requests.
 * - Focus on public data.
 * - For photos: Prefer direct image URLs from business sites when possible.
 */

import { chromium, Browser, Page } from 'playwright';

export interface ScrapeTarget {
  url: string;
  type: 'restaurant' | 'review' | 'menu' | 'photo' | 'other';
  placeName?: string;
  notes?: string;
}

export interface ScrapedData {
  url: string;
  title?: string;
  description?: string;
  photos: Array<{
    url: string;
    alt?: string;
    source: string;
  }>;
  menuItems?: Array<{
    name: string;
    description?: string;
    price?: string;
  }>;
  recentReviews?: Array<{
    text: string;
    date?: string;
    rating?: number;
    source: string;
  }>;
  lastScraped: string;
  error?: string;
}

export class BaseScraper {
  private browser: Browser | null = null;

  async launch() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // Needed for Docker/CI
      });
    }
    return this.browser;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async newPage(): Promise<Page> {
    const browser = await this.launch();
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (compatible; MosaicResearchBot/1.0; +https://mosaic.example.com)',
    });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });
    return page;
  }

  /**
   * Basic safe navigation with timeout and error handling
   */
  async safeGoto(page: Page, url: string, timeoutMs = 15000) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      return true;
    } catch (err) {
      console.warn(`Failed to load ${url}:`, err);
      return false;
    }
  }

  /**
   * Extract image URLs with basic filtering (avoid tracking pixels, icons, etc.)
   */
  async extractProductImages(page: Page, maxImages = 6): Promise<string[]> {
    const images = await page.$$eval('img', (imgs) =>
      imgs
        .map(img => img.src || img.getAttribute('data-src') || '')
        .filter(src => src && 
          !src.includes('pixel') && 
          !src.includes('icon') && 
          !src.includes('logo') &&
          !src.includes('avatar') &&
          (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp'))
        )
    );

    return [...new Set(images)].slice(0, maxImages);
  }

  async scrape(target: ScrapeTarget): Promise<ScrapedData> {
    const page = await this.newPage();
    const result: ScrapedData = {
      url: target.url,
      photos: [],
      lastScraped: new Date().toISOString(),
    };

    try {
      const loaded = await this.safeGoto(page, target.url);
      if (!loaded) {
        result.error = 'Failed to load page';
        return result;
      }

      result.title = await page.title();

      // Basic photo extraction focused on product-like images
      const imageUrls = await this.extractProductImages(page);
      result.photos = imageUrls.map(url => ({
        url,
        source: target.url,
      }));

      // TODO: Add more targeted extractors per type (restaurant, menu, etc.)

    } catch (err: any) {
      result.error = err.message;
    } finally {
      await page.close();
    }

    return result;
  }
}
