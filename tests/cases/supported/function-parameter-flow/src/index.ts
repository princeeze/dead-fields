const flowSource = { a: 1, b: 2 };

function consume(o: { a: number; b: number }) {
  return o.a;
}

consume(flowSource);
