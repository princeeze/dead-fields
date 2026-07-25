// dead-fields-ignore-object
const obj = {
  x: 1,
  y: 2,
};

fn({ config: obj });

function fn(_: unknown) {}
