#!/usr/bin/env tsx
/**
 * Scraper Orchestrator
 *
 * Takes research output from research-agent.ts and runs real web scraping
 * to validate and enrich data (especially photos and current details).
 *
 * This is the bridge between LLM research and ground-truth data.
 *
 * Usage:
 *   npx tsx scripts/scrapers/run-scraper.ts data/research-runs/some-run.json
 */

import fs from 'fs';
import { RestaurantScraper } from './restaurant-scraper';

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: npx tsx scripts/scrapers/run-scraper.ts <research-output.json>');
    process.exit(1);
  }

  const research = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  console.log(`Running scraper on research for: ${research.topic || 'unknown topic'}`);

  const scraper = new RestaurantScraper();
  const targets = RestaurantScraper.generateTargetsFromResearch(research);

  console.log(`Found ${targets.length} scrape targets from research.`);

  const results = [];
  for (const target of targets.slice(0, 10)) { // Limit for safety in early version
    console.log(`Scraping: ${target.url}`);
    const data = await scraper.scrapeRestaurant(target);
    results.push(data);
  }

  await scraper.close();

  const outFile = inputFile.replace('.json', '-scraped.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  console.log(`\nScraping complete. Results saved to ${outFile}`);
  console.log(`Real photos and details can now be merged into the research data.`);
}

main().catch(console.error);
