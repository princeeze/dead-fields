// Object literals declared in for-loop headers are not analyzed.
// `unused` should be reported as dead on `loopConfig`, but the binding is never tracked.
for (let i = 0, loopConfig = { used: 1, unused: 2 }; i < 1; i++) {
  console.log(loopConfig.used);
}
