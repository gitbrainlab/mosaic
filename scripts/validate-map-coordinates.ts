#!/usr/bin/env tsx
/**
 * Coordinate Sanity Validator
 * Usage: npx tsx scripts/validate-map-coordinates.ts public/data/maps/ice-cream-capital-district/entries.json
 */
import fs from 'fs';
import path from 'path';

const files = process.argv.slice(2).filter(f => fs.existsSync(f));

if (files.length === 0) {
  console.error('No valid entries.json files provided');
  process.exit(1);
}

const CITY_CENTERS: Record<string, {lat:number, lng:number}> = {
  albany: {lat:42.6526, lng:-73.7562},
  rensselaer: {lat:42.6365, lng:-73.7425},
};

function km(a:{lat:number,lng:number}, b:{lat:number,lng:number}) {
  const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  const lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
  const x=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

let totalErrors = 0;

for (const file of files) {
  const entries = JSON.parse(fs.readFileSync(file,'utf8'));
  let errors=0;
  console.log(`\nValidating ${path.basename(file)} (${entries.length} entries)`);
  entries.forEach((e:any) => {
    const c = e.location;
    const center = CITY_CENTERS[(c.city||'').toLowerCase()] || CITY_CENTERS.albany;
    const d = km({lat:c.lat,lng:c.lng}, center);
    if (d > 8) {
      console.error(`  BAD: ${e.name} (${c.city}) ${d.toFixed(1)}km off`);
      errors++;
    }
  });
  console.log(`  Errors in this file: ${errors}`);
  totalErrors += errors;
}

if (totalErrors > 0) {
  console.error(`\nFAILED with ${totalErrors} errors`);
  process.exit(1);
}
console.log('\nOK');
