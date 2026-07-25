const definition = {
  x: 1,
  y: 2,
};

function build() {
  return { config: definition };
}

const result = build();

console.log(result.config.x);
