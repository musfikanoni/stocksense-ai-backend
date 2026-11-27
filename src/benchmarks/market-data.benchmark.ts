import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";

// Replace with your actual processing function
import { normalizeMarketData } from "../services/market.service.js";

const rawData = JSON.parse(
  readFileSync(
    "src/benchmarks/fixtures/market-data.json",
    "utf-8"
  )
);

async function runBenchmark() {
  const results: number[] = [];

  // Warm-up
  for (let i = 0; i < 5; i++) {
    await normalizeMarketData(rawData);
  }

  // Actual test: 30 runs
  for (let i = 0; i < 30; i++) {
    const start = performance.now();

    await normalizeMarketData(rawData);

    const end = performance.now();

    results.push(end - start);
  }

  results.sort((a, b) => a - b);

  const average =
    results.reduce((a, b) => a + b, 0) / results.length;

  const median = (results[14] + results[15]) / 2;

  const p95 = results[Math.ceil(results.length * 0.95) - 1];

  console.table({
    Runs: results.length,
    Average: average.toFixed(2) + " ms",
    Median: median.toFixed(2) + " ms",
    P95: p95.toFixed(2) + " ms",
    Minimum: results[0].toFixed(2) + " ms",
    Maximum: results[29].toFixed(2) + " ms",
  });

  return {
    runs: results.length,
    average: Number(average.toFixed(2)),
    median: Number(median.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    minimum: Number(results[0].toFixed(2)),
    maximum: Number(results[29].toFixed(2)),
  };
}

runBenchmark().then((res) => {
  if (process.argv.includes("--save-before")) {
    writeFileSync("benchmark-before.json", JSON.stringify(res, null, 2), "utf-8");
    console.log("Saved results to benchmark-before.json");
  } else if (process.argv.includes("--save-after")) {
    writeFileSync("benchmark-after.json", JSON.stringify(res, null, 2), "utf-8");
    console.log("Saved results to benchmark-after.json");
  }
}).catch(console.error);
