# Data licence

This repository mixes code and data, and they carry different licences.

| What | Where | Licence |
| --- | --- | --- |
| Company profiles | `data/companies/*.yaml`, and the `profile` part of each published `data/v1/companies/<domain>.json` | CC BY 4.0 |
| US-derived tables | Published counts and pay built from the US Department of Labor's LCA and PERM disclosure files | US government work, public domain |
| Canada-derived tables | Published counts built from Canada's positive LMIA employers list | Open Government Licence – Canada |
| US place reference tables | `data/reference/us-counties-cbsa.csv`, `data/reference/us-zip-cbsa.csv`, and the US metro codes and names they put in the published files | US government work, public domain |
| Canadian place reference table | `data/reference/ca-csd-cma.csv`, and the Canadian metro codes and names it puts in the published files | Statistics Canada Open Licence |
| Code | Everything else: the pipeline, the tracker app, tests and docs | MIT, see [LICENSE](LICENSE) |

The licence lines, including the Statistics Canada notice below, are stored in `data/v1/meta.json` (under `licences`, the notice as `statcan`). They are also in the README and in the footer of the dataset's landing page.

## Company profiles: CC BY 4.0

The written profile content is licensed under the [Creative Commons Attribution 4.0 International licence](https://creativecommons.org/licenses/by/4.0/). You may copy, share and adapt it for any purpose, including commercial use, as long as you credit "Job Hunt HQ contributors" with a link to https://github.com/hjun-escape/job-hunt-hq, link to the licence, and say whether you changed anything.

Each profile fact links to the pages it was taken from. Those pages keep their own terms; the licence above covers only the profile text written here.

## US-derived tables: public domain

The US tables are built from the Office of Foreign Labor Certification's disclosure data, a work of the US federal government, which is in the public domain in the United States. No further rights are claimed in the tables built from it. Credit is welcome but not required, for example: "Source: US Department of Labor, Office of Foreign Labor Certification disclosure data."

## Canada-derived tables: Open Government Licence – Canada

The Canadian tables are built from the Temporary Foreign Worker Program positive LMIA employers list, published by Employment and Social Development Canada on open.canada.ca, and used under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada). That licence asks every reuse to keep this statement:

> Contains information licensed under the Open Government Licence – Canada.

## Place reference tables

US metro areas come from two US government works, both in the public domain:

- `us-counties-cbsa.csv` is built from the metropolitan and micropolitan statistical area delineation file (July 2023) that the Office of Management and Budget defines and the Census Bureau publishes.
- `us-zip-cbsa.csv` is built from the Census Bureau's 2020 ZIP Code Tabulation Area to county relationship file. ZIP codes stay inside the pipeline; only metro codes and names are published.

Canadian metro areas come from `ca-csd-cma.csv`, which is derived from Statistics Canada's Geographic Attribute File for the 2021 Census and used under the [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/reference/licence). Because the published place codes and names are adapted from it, the licence asks for this notice:

> Adapted from Statistics Canada, Geographic Attribute File (catalogue no. 92-151-X), 2021 Census. This does not constitute an endorsement by Statistics Canada of this product.

`ca-aliases.csv` (well-known place names that are not census subdivisions) is written by hand for this project.

## No endorsement

Neither the US Department of Labor, the Census Bureau, Employment and Social Development Canada nor Statistics Canada has reviewed or endorsed this dataset. The figures show past filings, not whether a company will sponsor you.

## Code: MIT

The code stays under the MIT licence in [LICENSE](LICENSE).
