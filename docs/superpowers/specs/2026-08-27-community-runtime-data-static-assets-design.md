# Community Runtime Data and Static Assets Design

## 1. 目标

修正 `travel-api/data/community` 被 Git 错误追踪的问题，并把运行时上传数据与随服务发布的默认图片分开：

- `travel-api/data/` 仅用于本地或部署环境的运行时数据，不进入 Git；
- 4 张内置默认图片作为 `community-service` 的 classpath 静态资源，随代码版本管理；
- 用户上传图片继续写入运行时上传目录；
- 清理当前分支中已提交的无用运行时图片；
- 不重写已有 Git 提交历史，不执行 force push。

## 2. 当前问题与根因

`community-service` 当前通过 `app.uploads.dir` 配置上传目录，并由 `WebConfig` 将该目录映射到 `/community/uploads/**`。Docker Compose 将宿主机的 `./data/community/uploads` 挂载到容器 `/uploads`。

同一个目录中同时存在：

1. `featured-1.png` 至 `featured-4.png`：由 `database/seed/community_seed.sql` 固定引用，是平台运行所需的内置景点图片；
2. 51 个 UUID 命名的图片：运行过程中产生的用户上传数据，不属于源代码。

该目录目前共有 55 个被追踪文件，约 16.93 MiB。默认图片与上传数据混放，导致运行时文件进入 Git，并使资源职责不清。

## 3. 资源布局与 URL 设计

### 3.1 默认图片

默认图片移动到：

```text
travel-api/community-service/src/main/resources/static/community/defaults/
├── featured-1.png
├── featured-2.png
├── featured-3.png
└── featured-4.png
```

Spring Boot 从 classpath 静态资源目录自动提供这些文件，对外 URL 为：

```text
/community/defaults/featured-1.png
/community/defaults/featured-2.png
/community/defaults/featured-3.png
/community/defaults/featured-4.png
```

### 3.2 用户上传图片

用户上传图片仍使用：

```text
/community/uploads/{uuid}.{extension}
```

`WebConfig` 继续只把配置项 `app.uploads.dir` 映射到 `/community/uploads/**`。它不再承担默认图片的服务职责，因此不会出现一个 URL 前缀同时查找两个物理目录的情况。

### 3.3 图片 URL 白名单

`CommunityImages.normalize` 保留现有的绝对 HTTP(S) 图片地址，并允许以下两个相对路径前缀：

- `/community/uploads/`
- `/community/defaults/`

其他相对路径、空值和空白字符串继续被过滤。

## 4. 数据库种子变更

`travel-api/database/seed/community_seed.sql` 中 4 个内置景点的 `cover_image_url` 和 `attraction_images.image_url` 全部从：

```text
/community/uploads/featured-N.png
```

改为：

```text
/community/defaults/featured-N.png
```

这样新初始化的数据库不会把默认资源误认为用户上传文件。已有数据库中的旧 URL 不在本次迁移范围内；如果部署环境已经初始化过数据库，应通过重新执行对应种子或单独的数据迁移更新这 8 个固定引用。

## 5. Git 忽略与索引清理

### 5.1 忽略规则

在根 `.gitignore` 中增加运行时数据规则：

```gitignore
travel-api/data/**
!travel-api/data/historical-sample-sources.md
```

这会忽略 `travel-api/data` 下的上传文件、数据库文件、消息队列文件和其他运行时产物，同时保留已有的说明文档 `historical-sample-sources.md`。

### 5.2 当前分支清理

执行以下迁移顺序：

1. 将 4 张 `featured-*.png` 复制到 `community-service` 的静态资源目录；
2. 校验复制后的文件与原文件内容一致；
3. 从 `travel-api/data/community/uploads` 删除 4 张默认图片；
4. 删除其余 51 张 UUID 命名的历史运行时图片；
5. 对 `travel-api/data/community` 中当前被追踪的路径执行 `git rm --cached`，使 Git 索引不再记录运行时数据；
6. 保留空的本地上传目录结构（目录本身不由 Git 追踪），Docker Compose 仍把它挂载到 `/uploads`。

“删除历史脏数据”在本次任务中指删除当前工作区和新提交中的无用文件，不包括使用 `git filter-repo` 等工具重写旧提交。旧提交中的二进制对象仍可能存在于仓库历史中，但不会再出现在当前分支的文件树中。

## 6. 代码变更边界

计划修改或新增：

- `.gitignore`
- `travel-api/database/seed/community_seed.sql`
- `travel-api/community-service/src/main/java/org/microarchitecturovisco/communityservice/util/CommunityImages.java`
- `travel-api/community-service/src/main/resources/static/community/defaults/featured-1.png`
- `travel-api/community-service/src/main/resources/static/community/defaults/featured-2.png`
- `travel-api/community-service/src/main/resources/static/community/defaults/featured-3.png`
- `travel-api/community-service/src/main/resources/static/community/defaults/featured-4.png`
- 与资源白名单和静态资源存在性相关的测试（如现有测试结构适合，则补充到对应测试类；不改变生产业务规则之外的行为）

不修改：

- `/community/uploads/**` 的上传接口路径；
- `FileStorageService` 生成 UUID 文件名和保存上传文件的逻辑；
- Docker Compose 中 `/uploads` 的运行时挂载语义；
- 与本任务无关的用户已有未跟踪文档和教程文件。

## 7. 验证标准

### 文件与 Git

- 4 张默认图存在于 `community-service/src/main/resources/static/community/defaults/`；
- `travel-api/data/community` 下不再有默认图或历史 UUID 图片；
- `git ls-files -- travel-api/data/community` 无输出；
- `git check-ignore -v travel-api/data/community/uploads/example.png` 命中 `travel-api/data/**`；
- `travel-api/data/historical-sample-sources.md` 仍可被 Git 追踪。

### 资源和代码

- `CommunityImages.normalize` 接受 `/community/defaults/featured-1.png`；
- 该方法仍接受 `/community/uploads/example.png` 和绝对 HTTP(S) 地址；
- 该方法仍过滤不允许的相对路径；
- 通过新增的 classpath 资源测试确认 4 张默认图可从 `src/main/resources/static/community/defaults/` 被读取；
- `FileStorageServiceTest` 继续通过，证明上传目录行为未被默认资源迁移破坏。

### 回归测试

至少运行：

```powershell
cd travel-api/community-service
mvn test
```

如果当前 JDK 与 Byte Buddy 版本组合需要实验参数，则使用：

```powershell
mvn "-Dnet.bytebuddy.experimental=true" test
```

并检查 `git diff --check` 与最终 `git status --short`。

## 8. 风险与回滚

- 风险：已有数据库记录仍引用旧的 `/community/uploads/featured-N.png`。缓解方式是提供明确的 SQL URL 更新或重新执行种子；本次代码不让上传目录继续承载默认图。
- 风险：删除本地运行时图片后，旧帖子中引用这些图片的记录可能显示为空。该数据被定义为无用历史脏数据，删除前应以当前分支文件清单为准。
- 回滚：在提交前可从 Git 当前版本恢复被删除的文件；提交后可通过 `git revert` 回滚代码和索引变更。默认图片的源文件位于新静态目录，不依赖运行时目录。
