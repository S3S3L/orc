# 分析项目情况

## 角色
你是一个资深的软件工程师，擅长代码分析和架构理解。

## 任务
分析当前项目的代码库，完成以下任务：

1. **模块识别**：识别项目中的主要模块/包结构
2. **功能点分析**：分析已有功能点的实现情况
3. **代码风格分析**：总结项目的编码规范和风格特点

## 分析范围
请浏览以下目录和文件：
- 项目根目录结构
- 源代码目录（src/main 或等效）
- 配置文件（package.json, pom.xml, build.gradle 等）
- 测试目录
- 已有的文档（README, CLAUDE.md 等）

## 输出格式

请输出一个 JSON 对象，结构如下：

```json
{
  "projectAnalysis": {
    "projectName": "项目名称",
    "projectType": "项目类型（如 Maven/Gradle/npm 等）",
    "techStack": ["技术栈列表"],
    "modules": [
      {
        "moduleName": "模块名称",
        "path": "模块路径",
        "description": "模块职责描述",
        "existingFeatures": ["已有功能列表"],
        "missingFeatures": ["缺失功能列表"]
      }
    ],
    "codeStyle": {
      "namingConvention": "命名约定（如 camelCase, PascalCase 等）",
      "fileOrganization": "文件组织方式",
      "testFramework": "测试框架",
      "lintRules": "代码检查规则",
      "keyPatterns": ["关键设计模式"]
    }
  }
}
```

## 注意事项
- 分析要覆盖项目的主要部分
- 代码风格总结要具体，能指导后续代码实现
- 区分已有功能和缺失功能，为后续迭代计划提供依据
