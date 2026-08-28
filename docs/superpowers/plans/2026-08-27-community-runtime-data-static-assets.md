# Community Runtime Data and Static Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate community default images from runtime upload data so `travel-api/data/community` is no longer tracked by Git while the four built-in featured images remain available as backend static assets.

**Architecture:** Keep `/community/uploads/**` mapped only to the runtime upload directory managed by `WebConfig` and `FileStorageService`. Move the four built-in images into `community-service` classpath static resources under `/community/defaults/**`, then update both fresh seed data and already-initialized databases to use the new URLs. Finish by ignoring `travel-api/data/**` runtime artifacts, preserving the tracked `historical-sample-sources.md` exception, and removing the currently tracked `travel-api/data/community` files from both the Git index and the working tree.

**Tech Stack:** Git, PowerShell, Spring Boot static resources, Flyway SQL migrations, JUnit 5, AssertJ, Maven

**Spec:** `docs/superpowers/specs/2026-08-27-community-runtime-data-static-assets-design.md`

## Global Constraints

- `travel-api/data/` 仅用于本地或部署环境的运行时数据，不进入 Git；
- 4 张内置默认图片作为 `community-service` 的 classpath 静态资源，随代码版本管理；
- 用户上传图片继续写入运行时上传目录；
- 清理当前分支中已提交的无用运行时图片；
- 不重写已有 Git 提交历史，不执行 force push。
- 不修改 `/community/uploads/**` 的上传接口路径。
- 不修改 `FileStorageService` 生成 UUID 文件名和保存上传文件的逻辑。
- Docker Compose 中 `/uploads` 的运行时挂载语义保持不变。
- 不触碰与本任务无关的用户未跟踪文档文件。

---

## File Map

- Modify: `.gitignore`
  - Add a broad runtime-data ignore rule and re-include `travel-api/data/historical-sample-sources.md`.
- Modify: `travel-api/community-service/src/main/java/org/microarchitecturovisco/communityservice/util/CommunityImages.java`
  - Allow `/community/defaults/` in the image URL whitelist while preserving the existing upload and HTTP(S) behavior.
- Create: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/util/CommunityImagesTest.java`
  - Lock the whitelist, deduplication, trimming, and six-image limit in a pure unit test.
- Create: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/config/CommunityStaticAssetsClasspathTest.java`
  - Verify the four bundled featured images are present on the classpath and non-empty without starting Spring.
- Create: `travel-api/community-service/src/main/resources/static/community/defaults/featured-1.png`
- Create: `travel-api/community-service/src/main/resources/static/community/defaults/featured-2.png`
- Create: `travel-api/community-service/src/main/resources/static/community/defaults/featured-3.png`
- Create: `travel-api/community-service/src/main/resources/static/community/defaults/featured-4.png`
  - Bundled image assets copied from the currently tracked runtime directory.
- Modify: `travel-api/database/seed/community_seed.sql`
  - Change the four built-in attraction URLs from `/community/uploads/featured-N.png` to `/community/defaults/featured-N.png`.
- Modify: `travel-api/community-service/src/main/resources/db/migration/R__seed.sql`
  - Keep Flyway repeatable seed data aligned with `database/seed/community_seed.sql`.
- Create: `travel-api/community-service/src/main/resources/db/migration/V2__move_featured_image_urls_to_static_defaults.sql`
  - Update already-initialized databases from `/community/uploads/featured-N.png` to `/community/defaults/featured-N.png` for the four fixed attraction ids.
- Delete: `travel-api/data/community/uploads/*.png`
- Delete: `travel-api/data/community/uploads/*.jpg`
  - Remove the current tracked runtime images from the working tree after they are copied or deemed disposable.

### Task 1: Lock the new image whitelist in unit tests

**Files:**
- Create: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/util/CommunityImagesTest.java`
- Modify: `travel-api/community-service/src/main/java/org/microarchitecturovisco/communityservice/util/CommunityImages.java`
- Test: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/util/CommunityImagesTest.java`

**Interfaces:**
- Consumes: `CommunityImages.normalize(List<String> imageUrls) -> List<String>`
- Produces: `CommunityImages.normalize(...)` accepts `http://`, `https://`, `/community/uploads/`, and `/community/defaults/`; trims entries, removes blanks, de-duplicates entries, and limits output to six items.

- [ ] **Step 1: Write the failing test**

```java
package org.microarchitecturovisco.communityservice.util;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CommunityImagesTest {

    @Test
    void keepsBundledDefaultImagesAndFiltersUnknownRelativePaths() {
        assertThat(CommunityImages.normalize(List.of(
                " /community/defaults/featured-1.png ",
                "/community/uploads/user-photo.png",
                "https://example.com/photo.jpg",
                "ftp://ignored.example.com/photo.jpg",
                "/community/private/hidden.png"
        ))).containsExactly(
                "/community/defaults/featured-1.png",
                "/community/uploads/user-photo.png",
                "https://example.com/photo.jpg"
        );
    }

    @Test
    void deduplicatesAndCapsAcceptedImagesAtSixEntries() {
        assertThat(CommunityImages.normalize(List.of(
                "/community/defaults/featured-1.png",
                "/community/defaults/featured-1.png",
                "/community/uploads/1.png",
                "/community/uploads/2.png",
                "/community/uploads/3.png",
                "/community/uploads/4.png",
                "/community/uploads/5.png",
                "/community/uploads/6.png",
                "/community/uploads/7.png"
        ))).containsExactly(
                "/community/defaults/featured-1.png",
                "/community/uploads/1.png",
                "/community/uploads/2.png",
                "/community/uploads/3.png",
                "/community/uploads/4.png",
                "/community/uploads/5.png"
        );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd E:\2026spring\26NULLptr\repositories\travel-api\community-service
mvn "-Dnet.bytebuddy.experimental=true" -Dtest=CommunityImagesTest test -q
```

Expected: FAIL because `/community/defaults/featured-1.png` is filtered out by the current `isAllowed` implementation.

- [ ] **Step 3: Write minimal implementation**

```java
private static boolean isAllowed(String url) {
    return url.startsWith("http://")
            || url.startsWith("https://")
            || url.startsWith("/community/uploads/")
            || url.startsWith("/community/defaults/");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
cd E:\2026spring\26NULLptr\repositories\travel-api\community-service
mvn "-Dnet.bytebuddy.experimental=true" -Dtest=CommunityImagesTest test -q
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add travel-api/community-service/src/main/java/org/microarchitecturovisco/communityservice/util/CommunityImages.java travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/util/CommunityImagesTest.java
git commit -m "test: cover community default image whitelist"
```

### Task 2: Bundle the four default images and update fixed database URLs

**Files:**
- Create: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/config/CommunityStaticAssetsClasspathTest.java`
- Create: `travel-api/community-service/src/main/resources/static/community/defaults/featured-1.png`
- Create: `travel-api/community-service/src/main/resources/static/community/defaults/featured-2.png`
- Create: `travel-api/community-service/src/main/resources/static/community/defaults/featured-3.png`
- Create: `travel-api/community-service/src/main/resources/static/community/defaults/featured-4.png`
- Modify: `travel-api/database/seed/community_seed.sql`
- Modify: `travel-api/community-service/src/main/resources/db/migration/R__seed.sql`
- Create: `travel-api/community-service/src/main/resources/db/migration/V2__move_featured_image_urls_to_static_defaults.sql`
- Test: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/config/CommunityStaticAssetsClasspathTest.java`

**Interfaces:**
- Consumes: Spring Boot classpath static-resource convention for `src/main/resources/static/**`
- Consumes: fixed built-in attraction ids `f0000000-0000-4000-a000-000000000001` through `f0000000-0000-4000-a000-000000000004`
- Produces: bundled files served from `/community/defaults/featured-N.png`
- Produces: fresh seed SQL and Flyway repeatable seed SQL that both reference `/community/defaults/featured-N.png`
- Produces: `V2__move_featured_image_urls_to_static_defaults.sql` to update already-initialized databases

- [ ] **Step 1: Write the failing test**

```java
package org.microarchitecturovisco.communityservice.config;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

class CommunityStaticAssetsClasspathTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "static/community/defaults/featured-1.png",
            "static/community/defaults/featured-2.png",
            "static/community/defaults/featured-3.png",
            "static/community/defaults/featured-4.png"
    })
    void bundledFeaturedImagesExistOnClasspath(String resourcePath) throws Exception {
        ClassPathResource resource = new ClassPathResource(resourcePath);

        assertThat(resource.exists()).isTrue();
        assertThat(resource.contentLength()).isGreaterThan(0L);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd E:\2026spring\26NULLptr\repositories\travel-api\community-service
mvn "-Dnet.bytebuddy.experimental=true" -Dtest=CommunityStaticAssetsClasspathTest test -q
```

Expected: FAIL because `static/community/defaults/featured-*.png` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Copy the four tracked files into bundled static resources:

```powershell
New-Item -ItemType Directory -Force 'E:\2026spring\26NULLptr\repositories\travel-api\community-service\src\main\resources\static\community\defaults' | Out-Null
Copy-Item -LiteralPath 'E:\2026spring\26NULLptr\repositories\travel-api\data\community\uploads\featured-1.png' -Destination 'E:\2026spring\26NULLptr\repositories\travel-api\community-service\src\main\resources\static\community\defaults\featured-1.png'
Copy-Item -LiteralPath 'E:\2026spring\26NULLptr\repositories\travel-api\data\community\uploads\featured-2.png' -Destination 'E:\2026spring\26NULLptr\repositories\travel-api\community-service\src\main\resources\static\community\defaults\featured-2.png'
Copy-Item -LiteralPath 'E:\2026spring\26NULLptr\repositories\travel-api\data\community\uploads\featured-3.png' -Destination 'E:\2026spring\26NULLptr\repositories\travel-api\community-service\src\main\resources\static\community\defaults\featured-3.png'
Copy-Item -LiteralPath 'E:\2026spring\26NULLptr\repositories\travel-api\data\community\uploads\featured-4.png' -Destination 'E:\2026spring\26NULLptr\repositories\travel-api\community-service\src\main\resources\static\community\defaults\featured-4.png'
```

Update the fresh-seed and repeatable-seed URLs:

```sql
-- Replace every built-in featured image URL in both files:
'/community/defaults/featured-1.png'
'/community/defaults/featured-2.png'
'/community/defaults/featured-3.png'
'/community/defaults/featured-4.png'
```

Add a versioned Flyway migration for existing databases:

```sql
UPDATE public.attraction
SET cover_image_url = CASE id
    WHEN 'f0000000-0000-4000-a000-000000000001'::uuid THEN '/community/defaults/featured-1.png'
    WHEN 'f0000000-0000-4000-a000-000000000002'::uuid THEN '/community/defaults/featured-2.png'
    WHEN 'f0000000-0000-4000-a000-000000000003'::uuid THEN '/community/defaults/featured-3.png'
    WHEN 'f0000000-0000-4000-a000-000000000004'::uuid THEN '/community/defaults/featured-4.png'
END
WHERE id IN (
    'f0000000-0000-4000-a000-000000000001'::uuid,
    'f0000000-0000-4000-a000-000000000002'::uuid,
    'f0000000-0000-4000-a000-000000000003'::uuid,
    'f0000000-0000-4000-a000-000000000004'::uuid
);

UPDATE public.attraction_images
SET image_url = CASE attraction_id
    WHEN 'f0000000-0000-4000-a000-000000000001'::uuid THEN '/community/defaults/featured-1.png'
    WHEN 'f0000000-0000-4000-a000-000000000002'::uuid THEN '/community/defaults/featured-2.png'
    WHEN 'f0000000-0000-4000-a000-000000000003'::uuid THEN '/community/defaults/featured-3.png'
    WHEN 'f0000000-0000-4000-a000-000000000004'::uuid THEN '/community/defaults/featured-4.png'
END
WHERE attraction_id IN (
    'f0000000-0000-4000-a000-000000000001'::uuid,
    'f0000000-0000-4000-a000-000000000002'::uuid,
    'f0000000-0000-4000-a000-000000000003'::uuid,
    'f0000000-0000-4000-a000-000000000004'::uuid
);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
cd E:\2026spring\26NULLptr\repositories\travel-api\community-service
mvn "-Dnet.bytebuddy.experimental=true" -Dtest=CommunityStaticAssetsClasspathTest test -q
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/config/CommunityStaticAssetsClasspathTest.java travel-api/community-service/src/main/resources/static/community/defaults/featured-1.png travel-api/community-service/src/main/resources/static/community/defaults/featured-2.png travel-api/community-service/src/main/resources/static/community/defaults/featured-3.png travel-api/community-service/src/main/resources/static/community/defaults/featured-4.png travel-api/database/seed/community_seed.sql travel-api/community-service/src/main/resources/db/migration/R__seed.sql travel-api/community-service/src/main/resources/db/migration/V2__move_featured_image_urls_to_static_defaults.sql
git commit -m "fix: bundle community featured images as static assets"
```

### Task 3: Ignore runtime community data and remove the tracked upload dump

**Files:**
- Modify: `.gitignore`
- Delete: `travel-api/data/community/uploads/*.png`
- Delete: `travel-api/data/community/uploads/*.jpg`
- Test: Git index and ignore-rule checks for `travel-api/data/community`

**Interfaces:**
- Consumes: root `.gitignore`
- Consumes: current tracked path `travel-api/data/community`
- Produces: `travel-api/data/**` ignored except `travel-api/data/historical-sample-sources.md`
- Produces: `git ls-files -- 'travel-api/data/community'` returns no entries
- Produces: empty local runtime upload directory recreated at `travel-api/data/community/uploads`

- [ ] **Step 1: Run the failing verification**

Run:

```powershell
cd E:\2026spring\26NULLptr\repositories
git ls-files -- 'travel-api/data/community'
git check-ignore -v --no-index 'travel-api/data/community/uploads/example.png'
```

Expected: the first command prints the 55 currently tracked files; the second command prints nothing because there is no ignore rule for `travel-api/data/community` yet.

- [ ] **Step 2: Write the ignore rule**

```gitignore
travel-api/data/**
!travel-api/data/historical-sample-sources.md
```

- [ ] **Step 3: Run ignore verification**

Run:

```powershell
cd E:\2026spring\26NULLptr\repositories
git check-ignore -v --no-index 'travel-api/data/community/uploads/example.png'
git check-ignore -v --no-index 'travel-api/data/historical-sample-sources.md'
```

Expected: the first command reports the new `travel-api/data/**` rule; the second command reports no ignore match because the file is re-included.

- [ ] **Step 4: Remove tracked runtime files from the Git index and the working tree**

Resolve the exact target paths first, then remove only the validated upload directory:

```powershell
$communityPath = (Resolve-Path 'E:\2026spring\26NULLptr\repositories\travel-api\data\community').Path
$uploadsPath = (Resolve-Path 'E:\2026spring\26NULLptr\repositories\travel-api\data\community\uploads').Path
if ($communityPath -ne 'E:\2026spring\26NULLptr\repositories\travel-api\data\community') { throw "Unexpected community path: $communityPath" }
if ($uploadsPath -ne 'E:\2026spring\26NULLptr\repositories\travel-api\data\community\uploads') { throw "Unexpected uploads path: $uploadsPath" }
git rm -r --cached -- 'travel-api/data/community'
Remove-Item -LiteralPath 'E:\2026spring\26NULLptr\repositories\travel-api\data\community\uploads' -Recurse -Force
New-Item -ItemType Directory -Force 'E:\2026spring\26NULLptr\repositories\travel-api\data\community\uploads' | Out-Null
```

- [ ] **Step 5: Run post-cleanup verification**

Run:

```powershell
cd E:\2026spring\26NULLptr\repositories
git ls-files -- 'travel-api/data/community'
Get-ChildItem -Force 'travel-api/data/community/uploads'
```

Expected: `git ls-files` prints nothing; `Get-ChildItem` returns no files because the runtime upload directory was recreated empty.

- [ ] **Step 6: Commit**

```bash
git add .gitignore
git add -u travel-api/data/community
git commit -m "fix: stop tracking community runtime uploads"
```

### Task 4: Run the module regression suite and final Git checks

**Files:**
- Test: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/util/CommunityImagesTest.java`
- Test: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/config/CommunityStaticAssetsClasspathTest.java`
- Test: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/service/FileStorageServiceTest.java`
- Test: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/CommunityServiceTest.java`
- Test: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/AttractionServiceTest.java`
- Verify: `.gitignore`
- Verify: `travel-api/database/seed/community_seed.sql`
- Verify: `travel-api/community-service/src/main/resources/db/migration/R__seed.sql`
- Verify: `travel-api/community-service/src/main/resources/db/migration/V2__move_featured_image_urls_to_static_defaults.sql`

**Interfaces:**
- Consumes: all changes from Tasks 1-3
- Produces: evidence that image normalization, bundled static assets, upload storage behavior, service tests, and Git cleanliness all still hold

- [ ] **Step 1: Run the targeted regression tests**

Run:

```powershell
cd E:\2026spring\26NULLptr\repositories\travel-api\community-service
mvn "-Dnet.bytebuddy.experimental=true" -Dtest=CommunityImagesTest,CommunityStaticAssetsClasspathTest,FileStorageServiceTest,CommunityServiceTest,AttractionServiceTest test -q
```

Expected: PASS

- [ ] **Step 2: Run the full module test suite**

Run:

```powershell
cd E:\2026spring\26NULLptr\repositories\travel-api\community-service
mvn "-Dnet.bytebuddy.experimental=true" test -q
```

Expected: PASS

- [ ] **Step 3: Run final repository verification**

Run:

```powershell
cd E:\2026spring\26NULLptr\repositories
git diff --check
git ls-files -- 'travel-api/data/community'
git check-ignore -v --no-index 'travel-api/data/community/uploads/example.png'
git status --short
```

Expected:

- `git diff --check` prints nothing
- `git ls-files -- 'travel-api/data/community'` prints nothing
- `git check-ignore` reports the `travel-api/data/**` rule
- `git status --short` shows only the intended static-resource, SQL, test, and `.gitignore` changes

- [ ] **Step 4: Commit**

```bash
git add .gitignore travel-api/database/seed/community_seed.sql travel-api/community-service/src/main/java/org/microarchitecturovisco/communityservice/util/CommunityImages.java travel-api/community-service/src/main/resources/db/migration/R__seed.sql travel-api/community-service/src/main/resources/db/migration/V2__move_featured_image_urls_to_static_defaults.sql travel-api/community-service/src/main/resources/static/community/defaults/featured-1.png travel-api/community-service/src/main/resources/static/community/defaults/featured-2.png travel-api/community-service/src/main/resources/static/community/defaults/featured-3.png travel-api/community-service/src/main/resources/static/community/defaults/featured-4.png travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/config/CommunityStaticAssetsClasspathTest.java travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/util/CommunityImagesTest.java
git add -u travel-api/data/community
git commit -m "fix: separate community static defaults from runtime uploads"
```

## Self-Review

### Spec coverage

- Static-resource relocation is implemented in Task 2.
- Runtime-data ignore rules and tracked-file cleanup are implemented in Task 3.
- `/community/uploads/**` path preservation is maintained because no task edits `WebConfig` or `FileStorageService`.
- Default image URL acceptance is implemented in Task 1.
- Existing-database URL preservation is covered by the new Flyway migration in Task 2.
- Final verification requirements are covered in Task 4.

### Placeholder scan

- No `TODO`, `TBD`, “implement later”, or “similar to Task N” placeholders remain.
- Each task includes exact file paths, concrete commands, and concrete code or SQL snippets.

### Type consistency

- `CommunityImages.normalize(List<String>) -> List<String>` is referenced consistently in Tasks 1 and 4.
- Default image URL prefix is consistently `/community/defaults/`.
- Runtime upload URL prefix is consistently `/community/uploads/`.
