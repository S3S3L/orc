
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
console.log(JSON.stringify({ received: input, source: 'node' }));
