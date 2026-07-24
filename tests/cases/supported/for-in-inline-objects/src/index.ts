// Object literals used as the enumerable target in for...in are not tracked.
// `used` and `unused` should be checked for reads, but no binding is created for the literal.
for (const key in { used: 1, unused: 2 }) {
  console.log(key);
}
