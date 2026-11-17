# Token Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/maucksn/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/maucksn/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01): it reads a sealed snapshot of DeFi protocols, ranks the pre-token ones by an implied value, and shows a reader how to farm each one.

## The model (radar-2)

Every protocol on the board has real locked value and no token on record yet. Its implied value is:

```
implied = TVL × category multiple × growth multiplier × maturity multiplier
```

- **Category multiple**: the median FDV/TVL of the tokenised protocols of that same category, taken from this very snapshot (at least 3 of them, else the global median), clamped to [0.05, 1.50]. No name is ever special-cased.
- **Growth multiplier**: `1 + clamp(change_7d, -60, 120)% × 0.5`.
- **Maturity multiplier**: `0.6 + min(age_days, 1095) / 1095 × 0.4` (age unknown: 365 days).

Exchanges, bridges, liquid-staking and restaking wrappers, and versioned pools are left off the board entirely, so the top of the board is never a wrapped token or a bridge a reader cannot farm. Protocols whose token already trades are set aside in a separate Live view, shown at the market's own value.

## The board

203 pre-token protocols, all farmable, ranked by implied value. The snapshot's 40-protocol watchlist is the floor, never the ceiling. Each row carries an 8-step farm plan with a cost and a time for every step, derived from the protocol's own category, chains, TVL and age.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22+, standard library only, no network, deterministic: the same snapshot in gives the same bytes out. It writes `board.json`, `data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` with the vendored make.fun library.

## The dashboard

A static page (`dashboard/index.html`, `app.css`, `app.js`), no framework and no network. It sorts and filters the board, opens a detail view per protocol with the model's breakdown and the 8 farm steps, and lists the live-token protocols separately.

## License

MIT. See [LICENSE](LICENSE).
