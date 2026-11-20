# Contributing

Thanks for helping! Company profiles are plain YAML files, and anyone can add or fix one.

## Add or fix a profile

1. Pick the company's main web domain, such as `example.com`. The file is `data/companies/example.com.yaml` and its `id` is the same domain.
2. Copy the example below, or an existing profile, and fill in what you can verify. Every field except `id`, `name`, `countries` and `entities` is optional, so a small, correct profile beats a big, doubtful one.
3. Run `npm ci` once, then `npm run dataset:validate`. It prints one line per problem, or `0 problems`.
4. Open a pull request. CI runs the same checks, and the template asks for your sources.

Don't want to write YAML? Open a "Request a company" issue instead.

A minimal profile that passes validation:

```yaml
id: example.com
name: Example Co
countries: [US]
entities: {}
mission:
  value:
    en: We make everyday tools for small teams.
  kind: official
  sources:
    - url: https://www.example.com/about
      seen: "2026-01-10"
  checked: "2026-01-10"
```

Companies in Korea also need a Korean (`ko`) summary in `mission` or `values`.

Matches to government data (employer records and the like) go through `entities`: FEINs, US legal names and Canadian names with their province. Each of these can belong to only one profile.

## Official and reported facts

Each fact has a `kind`:

- `official`: the company says it, on its own site. Every source must be on the company's domain, a subdomain of it, or a host listed in `officialHosts`.
- `reported`: someone else says it, such as a news article or a forum thread. These may cite any site.

## Sources and dates

Every fact needs at least one source link with the date you looked (`seen`), and a `checked` date for when you last confirmed it. Dates can't be in the future.

If the page also carries news, promos or anything else that changes often, link to the exact passage instead: in Chrome or Edge, select it, right-click and choose **Copy link to highlight**. The weekly re-check then watches only that passage (see [the runbook](docs/dataset/RUNBOOK.md)).

## Writing rules

- Summaries are at most 280 characters, in your own words.
- Don't copy pages or paste long passages. Short factual notes only.
- No personal data about named people (no names, emails, phone numbers or private details).
- Glassdoor, Blind and Reddit: link to them as sources, but never copy their text, ratings or quotes.

## What not to edit by hand

The sponsorship tables are generated from government data. Never edit them by hand, and don't add numbers to a profile. If a match looks wrong, fix the `entities` entry on the profile.

## Licence

Contributions to `data/companies` are licensed under CC BY 4.0. Code contributions follow the repository's MIT licence.
