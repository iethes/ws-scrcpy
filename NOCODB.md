# NocoDB API Reference

## Connection

- **Base URL:** `https://nocodb.magpie.co.id/api/v2`
- **Auth header:** `xc-token: <token>`
- **Token source (Windmill):** variable `f/niq/nocodb_token`
- **Wrapper class:** `f/niq/nocodb_api.py` → `APINocoDB`

## Endpoints

All endpoints follow the pattern: `{base_url}/tables/{table_id}/records`

| Action | Method | Body / Params |
|--------|--------|---------------|
| List records | `GET` | query params: `fields`, `where`, `sort`, `limit`, `offset`, `shuffle`, `viewId` |
| Get table meta | `GET` | `{base_url}/tables/{table_id}` (no `/records`) |
| Create record | `POST` | JSON body: `{"FieldName": "value", ...}` |
| Update record | `PATCH` | JSON body: `{"id": 123, "FieldName": "value", ...}` |
| Delete record | `DELETE` | JSON body: `{"Id": 123}` |

## Query Parameters

- **fields** — comma-separated column names, e.g. `Id,Name,Status`
- **where** — filter string using NocoDB syntax (see below)
- **sort** — field name; prefix with `-` for descending, e.g. `-CreatedAt`
- **limit** — max rows per page (default 25)
- **offset** — pagination offset
- **viewId** — optional NocoDB view ID

## Where Filter Syntax

Single condition:
```
(FieldName,operator,value)
```

Combine with `~and` or `~or`:
```
(Status,eq,active)~and(Country,eq,id)
```

### Operators

| Operator | Meaning |
|----------|---------|
| `eq` | equals |
| `neq` | not equals |
| `like` | contains (string) |
| `gt` | greater than |
| `lt` | less than |
| `ge` | greater or equal |
| `le` | less or equal |
| `is` | is (null check) |
| `isnot` | is not (null check) |

## Response Format

```json
{
  "list": [
    {"Id": 1, "FieldName": "value", ...},
    {"Id": 2, "FieldName": "value", ...}
  ],
  "pageInfo": {
    "totalRows": 100,
    "page": 1,
    "pageSize": 25,
    "isFirstPage": true,
    "isLastPage": false
  }
}
```

## Pagination

To fetch all records, loop until `pageInfo.isLastPage` is `true`, incrementing `offset` by `limit` each iteration.

## Gotchas

- **Id casing:** NocoDB returns `"Id"` (uppercase I) in responses, but `update_record` expects lowercase `"id"` in the request body.
- **Delete body:** Uses `{"Id": <int>}` (uppercase I).
- **Empty where/sort:** Omit the param entirely rather than sending empty string.

## Table mobile-scrapers:
Table in our NocoDB that holds the existing mapping of devices ztnet_ips, labels, regions, orchestrator assignments, etc. 

This is the response you get from GET api:

```
{
  "records": [
    {
      "id": "string",
      "fields": {
        "ztnet_ip": "string",
        "label": "string",
        "regions": [
          "string"
        ],
        "loggedin": [
          "string"
        ],
        "operator": "string",
        "remote_stream": "string",
        "orchestrator_id": "BPP-G1",
        "active": true
      }
    }
  ],
  "next": "string",
  "prev": "string",
  "nestedNext": "string",
  "nestedPrev": "string"
}
```
