const login = process.env.LOGIN;
const token = process.env.GH_TOKEN;

const query = `
query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    pullRequests(states: MERGED) { totalCount }
    contributionsCollection { totalCommitContributions }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      nodes {
        stargazerCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login } })
});

const body = await res.json();
if (body.errors) throw new Error(JSON.stringify(body.errors));
const u = body.data.user;

const stars = u.repositories.nodes.reduce((n, r) => n + r.stargazerCount, 0);
const commits = u.contributionsCollection.totalCommitContributions;
const prs = u.pullRequests.totalCount;
const followers = u.followers.totalCount;

const sizes = new Map();
for (const repo of u.repositories.nodes) {
  for (const e of repo.languages.edges) {
    const cur = sizes.get(e.node.name) || { size: 0, color: e.node.color || "#2A2F38" };
    cur.size += e.size;
    sizes.set(e.node.name, cur);
  }
}
const total = [...sizes.values()].reduce((n, v) => n + v.size, 0) || 1;
const ranked = [...sizes.entries()].sort((a, b) => b[1].size - a[1].size);
const top = ranked.slice(0, 4).map(([name, v]) => ({
  name, color: v.color, pct: (v.size / total) * 100
}));
const rest = ranked.slice(4).reduce((n, [, v]) => n + v.size, 0);
if (rest > 0) top.push({ name: "Other", color: "#2A2F38", pct: (rest / total) * 100 });

const esc = s => s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const num = n => n.toLocaleString("en-US");

const BAR_X = 56, BAR_W = 788;
let x = BAR_X;
const bars = top.map(l => {
  const w = Math.max(2, Math.round((l.pct / 100) * BAR_W));
  const r = `<rect x="${x}" y="210" width="${w}" height="12" rx="2" fill="${l.color}"/>`;
  x += w + 4;
  return r;
}).join("");

let lx = BAR_X;
const legend = top.map(l => {
  const label = `${esc(l.name)} ${Math.round(l.pct)}%`;
  const g = `<circle cx="${lx + 6}" cy="252" r="4" fill="${l.color}"/>` +
            `<text x="${lx + 18}" y="256" fill="#9AA4B2">${label}</text>`;
  lx += 18 + label.length * 7.3 + 26;
  return g;
}).join("");

const stat = (x, value, label, accent) =>
  `<text x="${x}" y="122" font-size="44" font-weight="700" fill="${accent ? "#00E5A0" : "#FFFFFF"}">${value}</text>` +
  `<text x="${x}" y="144" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="11" letter-spacing="1" fill="#6B7280">${label}</text>`;

const svg = `<svg viewBox="0 0 900 300" xmlns="http://www.w3.org/2000/svg" width="900" height="300">
<rect width="900" height="300" fill="#08090C"/>
<g opacity="0.5" stroke="#16181D" stroke-width="1">
<line x1="0" y1="60" x2="900" y2="60"/><line x1="0" y1="120" x2="900" y2="120"/>
<line x1="0" y1="180" x2="900" y2="180"/><line x1="0" y1="240" x2="900" y2="240"/>
<line x1="150" y1="0" x2="150" y2="300"/><line x1="300" y1="0" x2="300" y2="300"/>
<line x1="450" y1="0" x2="450" y2="300"/><line x1="600" y1="0" x2="600" y2="300"/>
<line x1="750" y1="0" x2="750" y2="300"/>
</g>
<rect x="0" y="0" width="14" height="300" fill="#00E5A0"/>
<text x="56" y="54" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="13" fill="#00E5A0">~ $</text>
<text x="86" y="54" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="13" fill="#C9D1D9">gh api --stats</text>
<g font-family="ui-sans-serif,-apple-system,Segoe UI,sans-serif">
${stat(56, num(stars), "STARS")}
${stat(256, num(commits), "COMMITS · 1Y")}
${stat(496, num(prs), "PRS MERGED", true)}
${stat(716, num(followers), "FOLLOWERS")}
</g>
<text x="56" y="196" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="11" letter-spacing="1" fill="#6B7280">TOP LANGUAGES</text>
${bars}
<g font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12">${legend}</g>
<text x="844" y="286" text-anchor="end" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="10" fill="#3A4048">updated ${new Date().toISOString().slice(0, 10)}</text>
</svg>`;

await (await import("node:fs/promises")).writeFile("stats.svg", svg);