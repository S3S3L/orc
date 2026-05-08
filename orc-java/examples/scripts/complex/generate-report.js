const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
console.log(JSON.stringify({
  status: 'ok',
  report: 'Generated report for ' + (data.users?.length || 0) + ' users',
  data: data
}));
