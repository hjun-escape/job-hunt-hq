# Data licence

This repository mixes code and data, and they carry different licences.

| What | Where | Licence |
| --- | --- | --- |
| Company profiles | `data/companies/*.yaml`, and the `profile` part of each published `data/v1/companies/<domain>.json` | CC BY 4.0 |
| US-derived tables | Published counts and pay built from the US Department of Labor's LCA and PERM disclosure files | US government work, public domain |
| Canada-derived tables | Published counts built from Canada's positive LMIA employers list | Open Government Licence – Canada |
| Code | Everything else: the pipeline, the tracker app, tests and docs | MIT, see [LICENSE](LICENSE) |

The same licence lines are stored in `data/v1/meta.json` (under `licences`), in the README and in the footer of the dataset's landing page.

## Company profiles: CC BY 4.0

The written profile content is licensed under the [Creative Commons Attribution 4.0 International licence](https://creativecommons.org/licenses/by/4.0/). You may copy, share and adapt it for any purpose, including commercial use, as long as you credit "Job Hunt HQ contributors" with a link to https://github.com/hjun-escape/job-hunt-hq, link to the licence, and say whether you changed anything.

Each profile fact links to the pages it was taken from. Those pages keep their own terms; the licence above covers only the profile text written here.

## US-derived tables: public domain

The US tables are built from the Office of Foreign Labor Certification's disclosure data, a work of the US federal government, which is in the public domain in the United States. No further rights are claimed in the tables built from it. Credit is welcome but not required, for example: "Source: US Department of Labor, Office of Foreign Labor Certification disclosure data."

US metro areas are Census Bureau core-based statistical areas, also a US government work.

## Canada-derived tables: Open Government Licence – Canada

The Canadian tables are built from the Temporary Foreign Worker Program positive LMIA employers list, published by Employment and Social Development Canada on open.canada.ca. Canadian metro areas come from Statistics Canada's geographic attribute file. Both are used under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada), which asks every reuse to keep this statement:

> Contains information licensed under the Open Government Licence – Canada.

## No endorsement

Neither the US Department of Labor nor the Government of Canada has reviewed or endorsed this dataset. The figures show past filings, not whether a company will sponsor you.

## Code: MIT

The code stays under the MIT licence in [LICENSE](LICENSE).
