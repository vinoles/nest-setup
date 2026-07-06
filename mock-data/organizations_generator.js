
function randomInt(max = 1000) {
  return Math.floor(Math.random() * max);
}


function randomString(prefix = 'str') {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}`;
}

function generateItem(id) {
  return {
    id,
    "name": randomString("name"),
    "description": randomString("description"),
    "userData": {},
    "nodeApprovalMode": "AUTOMATIC",
  };
}

const data = Array.from({ length: 500 }, (_, i) => generateItem(i));

console.log(JSON.stringify(data, null, 2));