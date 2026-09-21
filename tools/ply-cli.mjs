#!/usr/bin/env node
/**
 * PLY Pipeline CLI
 * Process PLY files from the command line
 */

import { readFileSync, writeFileSync } from 'fs';
import { 
  parsePly, 
  generateStats, 
  optimizeForThreeJs, 
  decimatePly, 
  centerAndScale,
  toJSON 
} from '../shared/ply-pipeline.mjs';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
PLY Pipeline CLI

Usage:
  node ply-cli.mjs <command> <input.ply> [options]

Commands:
  info                  Show PLY file statistics
  optimize             Optimize for Three.js (outputs JSON)
  decimate <factor>    Reduce vertex count (0.0-1.0)
  center [size]        Center and scale to target size (default: 10)
  
Examples:
  node ply-cli.mjs info scan.ply
  node ply-cli.mjs optimize scan.ply > optimized.json
  node ply-cli.mjs decimate 0.5 scan.ply > decimated.ply
  node ply-cli.mjs center 5 scan.ply
  `);
  process.exit(0);
}

const command = args[0];
let inputFile, extraArg;

async function main() {
  // Parse command-specific arguments
  switch (command) {
    case 'decimate':
      extraArg = parseFloat(args[1]);
      inputFile = args[2];
      break;
    case 'center':
      if (args.length === 3) {
        extraArg = parseFloat(args[1]);
        inputFile = args[2];
      } else {
        extraArg = 10;
        inputFile = args[1];
      }
      break;
    default:
      inputFile = args[1];
  }

  if (!inputFile) {
    console.error('Error: No input file specified');
    process.exit(1);
  }

  console.error(`Loading ${inputFile}...`);
  const buffer = readFileSync(inputFile).buffer;
  
  console.error('Parsing PLY...');
  const plyData = await parsePly(buffer);
  
  console.error('✓ Parsed successfully\n');

  switch (command) {
    case 'info': {
      const stats = generateStats(plyData);
      console.log(stats);
      break;
    }

    case 'optimize': {
      console.error('Optimizing for Three.js...');
      const optimized = optimizeForThreeJs(plyData);
      const json = JSON.stringify(optimized, null, 2);
      console.log(json);
      console.error(`✓ Optimized to ${optimized.metadata.vertexCount} vertices`);
      break;
    }

    case 'decimate': {
      if (isNaN(extraArg) || extraArg <= 0 || extraArg > 1) {
        console.error('Error: Decimation factor must be between 0 and 1');
        process.exit(1);
      }
      console.error(`Decimating by factor ${extraArg}...`);
      const decimated = decimatePly(plyData, extraArg);
      console.error(`✓ Reduced from ${plyData.metadata.vertexCount} to ${decimated.metadata.vertexCount} vertices`);
      const stats = generateStats(decimated);
      console.log(stats);
      break;
    }

    case 'center': {
      const targetSize = extraArg || 10;
      console.error(`Centering and scaling to size ${targetSize}...`);
      const centered = centerAndScale(plyData, targetSize);
      const stats = generateStats(centered);
      console.log(stats);
      console.error('✓ Centered and scaled');
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
