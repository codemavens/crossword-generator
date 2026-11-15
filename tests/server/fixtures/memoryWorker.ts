// Worker that allocates until it hits its heap limit.
const hoard: number[][] = [];
for (;;) hoard.push(new Array(1_000_000).fill(1));
