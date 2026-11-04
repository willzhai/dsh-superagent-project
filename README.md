# dsh-superagent-project

Test repository for a locally deployed DeepSeek Super-agent.

Agent changes are delivered on task branches through pull requests. Merging remains manual.

## 项目用途

本仓库是本地部署的 DeepSeek Super-agent 的测试仓库，用于验证 agent 的完整工作流程：agent 根据测试需求在独立的任务分支上完成改动并创建 Pull Request，由人工审核和合并。

仓库中的需求与改动仅用于流程测试，不代表真实产品或业务项目。

## 如何提交测试需求

1. 在本仓库的 Issues 中新建 Issue，标题简要说明需要完成的改动。
2. 在正文中写明期望 agent 做的事情，例如要修改的文件和期望的结果，并 @willzhai 通知 agent。
3. agent 会在独立分支上提交 Pull Request；请人工审核，确认无误后由人工合并。
