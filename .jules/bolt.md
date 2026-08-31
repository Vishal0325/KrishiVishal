## 2025-05-15 - Memoize list filtering and aggregate calculations in Compose screens
**Learning:** Heavy collection operations (`filter`, `sumOf`, `count`) inside Compose screen functions re-execute on every recomposition if not wrapped in `remember`.
**Action:** Always wrap collection filtering and aggregations in `remember(key1, key2)` inside `@Composable` functions when depending on state or parameters.
