// for await...of has the same gap as for...of for inline object literals.
async function run() {
  for await (const item of [{ read: 1, unread: 2 }]) {
    console.log(item.read);
  }
}

run();
