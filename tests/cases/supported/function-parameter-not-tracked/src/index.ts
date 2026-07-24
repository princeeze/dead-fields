const passedThrough = { a: 1, b: 2 };

function readA(o: { a: number; b: number }) {
  return o.a;
}

readA(passedThrough);
