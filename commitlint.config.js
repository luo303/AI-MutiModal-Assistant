export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // 允许更长的 header（默认 72 字符偏短）
    "header-max-length": [2, "always", 100],
    // 允许的 type 枚举（保留 conventional 默认值 + 项目常用）
    "type-enum": [
      2,
      "always",
      [
        "feat",     // 新功能
        "fix",      // 修复 Bug
        "docs",     // 文档
        "style",    // 代码格式（不影响逻辑）
        "refactor", // 重构
        "perf",     // 性能优化
        "test",     // 测试
        "build",    // 构建系统 / 依赖
        "ci",       // CI/CD
        "chore",    // 杂务
        "revert",   // 回滚
      ],
    ],
    // body 首行不能为空（保证 commit message 格式规范）
    "body-leading-blank": [1, "always"],
    // footer 首行不能为空
    "footer-leading-blank": [1, "always"],
  },
};
