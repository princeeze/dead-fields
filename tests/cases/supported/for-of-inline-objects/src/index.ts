// Inline object literals in for...of iterables are not bound to a tracked variable.
// `unread` should be reported as dead, but the object is never assigned to a named binding.
for (const item of [{ read: 1, unread: 2 }]) {
  console.log(item.read);
}
