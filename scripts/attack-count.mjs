// scripts/attack-count.mjs
const EVENT_ID = process.argv[2];
const TOTAL = Number(process.argv[3] ?? 500);
const CONCURRENCY = Number(process.argv[4] ?? 100);

if (!EVENT_ID) {
  console.error("Usage: node scripts/attack-count.mjs <eventId> [total=500] [concurrency=100]");
  process.exit(1);
}

async function sendOne(i) {
  const res = await fetch("http://localhost:3000/api/purchase", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventId: EVENT_ID,
      userId: `user-${i}`,
      qty: 1,
    }),
  });
  const data = await res.json();
  return data.result;
}

async function main() {
  console.log(`Attacking: ${TOTAL} requests, ${CONCURRENCY} concurrent`);
  const start = Date.now();

  const results = { SUCCESS: 0, FAILED: 0, OTHER: 0 };
  let i = 0;

  async function worker() {
    while (i < TOTAL) {
      const myIdx = i++;
      try {
        const r = await sendOne(myIdx);
        if (r === "SUCCESS") results.SUCCESS++;
        else if (r === "FAILED") results.FAILED++;
        else results.OTHER++;
      } catch {
        results.OTHER++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const elapsed = Date.now() - start;
  console.log(`\n=== Done in ${elapsed}ms ===`);
  console.log(results);

  const ev = await fetch(`http://localhost:3000/api/events`).then((r) => r.json());
  const thisEvent = ev.find((e) => e.id === EVENT_ID);
  if (thisEvent) {
    console.log(`\n=== DB state ===`);
    console.log(`totalTickets: ${thisEvent.totalTickets}`);
    console.log(`remaining:    ${thisEvent.remaining}`);
    console.log(`sold (by DB): ${thisEvent.totalTickets - thisEvent.remaining}`);
    console.log(`sold (by API response): ${results.SUCCESS}`);

    const oversold = results.SUCCESS - (thisEvent.totalTickets - thisEvent.remaining);
    if (oversold > 0) {
      console.log(`\n🔥 OVERSOLD by ${oversold} tickets!`);
      console.log(`   (API 告訴 ${results.SUCCESS} 個人搶到, 但 DB 只扣了 ${thisEvent.totalTickets - thisEvent.remaining} 張)`);
    } else if (thisEvent.remaining < 0) {
      console.log(`\n🔥 NEGATIVE remaining! Oversold.`);
    } else {
      console.log(`\n✅ No oversell detected (this time...)`);
    }
  }
}

main();