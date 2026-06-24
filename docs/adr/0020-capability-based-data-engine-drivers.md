# Capability-based data-engine drivers

Krust drivers advertise independent capabilities instead of implementing one
relational interface or relying on scattered engine-name checks. Common
connection lifecycle is shared, while SQL/schema, tabular data, routines, query
plans, Redis keys, and mutation support are optional capabilities. This lets
Redis provide a native key workflow and lets StarRocks reuse MySQL transport
without inheriting unsupported MySQL editing features.
