// client側でfetchを使ってサーバーにリクエストを送る
fetch("").then((r) => r.json()).then((d) => console.log(JSON.stringify(d))).catch((e) => console.error(e));
// referrerをみる
console.log(document.referrer);
