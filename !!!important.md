# 数据库更新说明

自 **引入 Flyway 后**，普通的表结构变更不再需要删库。

## 常规更新（改了表结构 / 加了字段）

按 Flyway 流程新增迁移脚本即可，数据会被保留：

1. 在对应服务的 `src/main/resources/db/migration/` 下新增 `V2__xxx.sql`（依次 `V3__`、`V4__`…，从 **V2** 起，V1 是基线）。
2. 只写纯 SQL，**不要用 psql 元命令**（`\connect` / `\copy` / `\i`）。
3. 同步改对应的 JPA 实体，让 Hibernate `validate` 通过。
4. 重新部署，Flyway 会自动增量应用，无需删库：

```powershell
mise run services:up_build
```

## 仍然需要重置数据库的情况

只有下面两种情况才需要清库（因为它们不走 Flyway 增量路径）：

- 修改了**种子数据** `database/seed/*.sql` 或种子 CSV，想让新数据生效；
- 修改了 `database/schema/*.sql` **基线本身**（正确做法应是改用 V2 迁移，而不是改基线）。

此时用 PowerShell 执行：

```powershell
cd travel-api
mise run services:down
Remove-Item -Recurse -Force .\data\postgres
mise run services:up_build
```
