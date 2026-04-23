#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { program } from 'commander';

type FormatType = 'html' | 'markdown';

type MessageContent = string | ContentItem[];

interface BaseContentItem {
  type: string;
  [key: string]: any;
}

interface TextContentItem extends BaseContentItem {
  type: 'text';
  text?: string;
}

interface ToolUseContentItem extends BaseContentItem {
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ToolResultContentItem extends BaseContentItem {
  type: 'tool_result';
  tool_use_id?: string;
  content?: string | BaseContentItem[];
}

type ContentItem = TextContentItem | ToolUseContentItem | ToolResultContentItem | BaseContentItem;

interface ConversationMessage {
  role?: string;
  content?: MessageContent;
  timestamp?: string;
}

interface ConversationRecord {
  timestamp?: string;
  message?: ConversationMessage;
}

interface ToolResultData {
  result: ToolResultContentItem;
  timestamp?: string;
}

interface ExportResult {
  success: boolean;
  outputPath: string;
  fileSize: string;
  subagentCount: number;
}

/**
 * Claude conversation export tool - Node.js version.
 * Supports exporting to HTML or Markdown, including inline subagent rendering.
 */
class ConversationExporter {
  formatType: FormatType;
  subagentContents: Map<string, ConversationRecord[]>;
  processedToolResults: Set<string>;

  constructor(formatType: FormatType = 'html') {
    this.formatType = formatType;
    this.subagentContents = new Map<string, ConversationRecord[]>();
    this.processedToolResults = new Set<string>();
  }

  /**
   * Extract the agent ID from a tool result.
   */
  extractAgentIdFromToolResult(toolResultContent: unknown): string | null {
    let contentStr = '';

    if (Array.isArray(toolResultContent)) {
      for (const item of toolResultContent) {
        if (typeof item === 'object' && item !== null && 'type' in item && item.type === 'text') {
          const text = 'text' in item && typeof item.text === 'string' ? item.text : '';
          contentStr += text;
        }
      }
    } else if (typeof toolResultContent === 'string') {
      contentStr = toolResultContent;
    }

    // Look for the pattern: agentId: aXXXXXXXXXXXXXXXX
    const match1 = contentStr.match(/agentId:\s*([a-f0-9]+)/);
    if (match1) return match1[1];

    // Also try the agent-XXXXXXX pattern
    const match2 = contentStr.match(/agent-([a-f0-9]+)/);
    if (match2) return match2[1];

    return null;
  }

  /**
   * Find a subagent file by exact agent ID.
   */
  findSubagentFileById(sessionDir: string, agentId: string): string | null {
    const subagentDir = path.join(sessionDir, 'subagents');
    if (!fs.existsSync(subagentDir)) {
      return null;
    }

    const subagentFile = path.join(subagentDir, `agent-${agentId}.jsonl`);
    if (fs.existsSync(subagentFile)) {
      return subagentFile;
    }

    return null;
  }

  /**
   * Find the corresponding subagent file by timestamp as a fallback.
   */
  findSubagentFile(sessionDir: string, approximateTime: string): string | null {
    const subagentDir = path.join(sessionDir, 'subagents');
    if (!fs.existsSync(subagentDir)) {
      return null;
    }

    // Collect all subagent files and their modification times
    const files = fs.readdirSync(subagentDir)
      .filter((f: string) => f.startsWith('agent-') && f.endsWith('.jsonl'))
      .map(f => {
        const filePath = path.join(subagentDir, f);
        const stats = fs.statSync(filePath);
        return { path: filePath, mtime: stats.mtime };
      })
      .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

    const targetTime = new Date(approximateTime);

    // Find the closest file that is not later than the specified time
    for (let i = files.length - 1; i >= 0; i--) {
      const file = files[i];
      if (file.mtime <= targetTime) {
        const agentId = path.basename(file.path, '.jsonl');
        if (!this.subagentContents.has(agentId)) {
          return file.path;
        }
      }
    }

    // If none is found, return the first unused file
    for (const file of files) {
      const agentId = path.basename(file.path, '.jsonl');
      if (!this.subagentContents.has(agentId)) {
        return file.path;
      }
    }

    return null;
  }

  /**
   * Parse a subagent file.
   */
  parseSubagent(subagentFilePath: string): ConversationRecord[] {
    const lines = fs.readFileSync(subagentFilePath, 'utf-8')
      .split('\n')
      .filter(line => line.trim());

    const messages: ConversationRecord[] = [];
    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as ConversationRecord;
        messages.push(msg);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(`Warning: Failed to parse subagent line: ${message}`);
      }
    }

    return messages;
  }

  /**
   * Escape HTML.
   */
  escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Format text content with support for collapsing long text.
   */
  formatTextWithCollapse(text: string): string {
    if (this.formatType === 'markdown') {
      return text + '\n\n';
    }

    const lines = text.split('\n');
    const threshold = 30;

    if (lines.length <= threshold) {
      // Short text: render directly
      // Keep content out of innerHTML to avoid extra line breaks before markdown rendering
      return `<div class="content" data-markdown-text="${this.escapeHtml(text)}"></div>\n`;
    }

    // Long text: use collapsible rendering
    const visibleLines = lines.slice(0, 10);
    const hiddenLines = lines.slice(10);

    let output = '<div class="content collapsible-content">\n';
    // Keep content out of innerHTML to avoid extra line breaks before markdown rendering
    output += `<div class="visible-content" data-markdown-text="${this.escapeHtml(visibleLines.join('\n'))}"></div>\n`;
    output += '<div class="hidden-content" style="display: none;">\n';
    output += `<div data-markdown-text="${this.escapeHtml(hiddenLines.join('\n'))}"></div>\n`;
    output += '</div>\n';
    output += `<button class="toggle-button" onclick="this.previousElementSibling.style.display = this.previousElementSibling.style.display === 'none' ? 'block' : 'none'; this.textContent = this.previousElementSibling.style.display === 'none' ? '▼ Expand (${hiddenLines.length} lines)' : '▲ Collapse'">▼ Expand (${hiddenLines.length} lines)</button>\n`;
    output += '</div>\n';

    return output;
  }

  /**
   * Format a tool call with collapsible content and optional inline subagent rendering.
   * toolResultData: {result: toolResult, timestamp: endTimestamp}
   * startTimestamp: timestamp of the tool_use event
   */
  formatToolUseCollapsible(
    toolUse: ToolUseContentItem,
    subagentContent: ConversationRecord[] | null = null,
    toolResultData: ToolResultData | null = null,
    startTimestamp: string | null = null
  ): string {
    const toolName = toolUse.name || 'Unknown';
    const toolInput = toolUse.input || {};
    const isAgentTool = toolName === 'Agent';

    // Extract tool_result and timestamps
    const toolResult = toolResultData?.result;
    const endTimestamp = toolResultData?.timestamp;

    // Compute duration
    let duration = null;
    let startTimeStr = '';
    let endTimeStr = '';
    let durationStr = '';

    if (startTimestamp) {
      const startDt = new Date(startTimestamp);
      startTimeStr = startDt.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    }

    if (endTimestamp) {
      const endDt = new Date(endTimestamp);
      endTimeStr = endDt.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      if (startTimestamp) {
        duration = (new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()) / 1000;
        durationStr = `${duration.toFixed(2)}s`;
      }
    }

    if (this.formatType === 'markdown') {
      let output = `🔧 **Using tool: ${toolName}**`;
      if (startTimeStr) {
        output += ` (start: ${startTimeStr}`;
        if (endTimeStr) {
          output += `, end: ${endTimeStr}, duration: ${durationStr}`;
        }
        output += ')';
      }
      output += '\n\n';

      output += '```json\n';
      output += JSON.stringify(toolInput, null, 2);
      output += '\n```\n\n';

      if (isAgentTool && subagentContent) {
        output += '### 📦 Subagent Execution Details\n\n';
        output += this.formatSubagentMessages(subagentContent);
      }

      if (toolResult) {
        output += this.formatToolResult(toolResult);
      }

      return output;
    }

    // HTML format
    let output = '<details class="tool-call-details">\n';
    output += '<summary class="tool-call-summary">\n';
    output += '<span class="tool-icon">🔧</span>\n';
    output += `<span class="tool-name">${this.escapeHtml(toolName)}</span>\n`;

    // For Agent tools, show the subagent type and description
    if (isAgentTool) {
      const subagentType = typeof toolInput.subagent_type === 'string'
        ? toolInput.subagent_type
        : 'general-purpose';
      output += `<span class="tool-badge agent-badge">${this.escapeHtml(subagentType)}</span>\n`;

      const description = typeof toolInput.description === 'string' ? toolInput.description : '';
      if (description) {
        output += `<span class="tool-description">${this.escapeHtml(description)}</span>\n`;
      }
    }

    // Show timing information
    if (startTimeStr || durationStr) {
      output += '<span class="tool-timing">';
      if (startTimeStr) {
        output += `⏱ ${startTimeStr}`;
      }
      if (durationStr) {
        output += ` → ${durationStr}`;
      }
      output += '</span>\n';
    }

    output += '<span class="toggle-icon">▼</span>\n';
    output += '</summary>\n';
    output += '<div class="tool-call-content">\n';

    // Tool input section
    output += '<div class="tool-section">\n';
    output += '<h5>📥 Input</h5>\n';
    output += '<pre><code class="language-json">';
    output += this.escapeHtml(JSON.stringify(toolInput, null, 2));
    output += '</code></pre>\n';
    output += '</div>\n';

    // Embed subagent content
    if (isAgentTool && subagentContent) {
      output += '<details class="subagent-details">\n';
      output += '<summary class="subagent-summary">\n';
      output += '<span class="subagent-icon">🤖</span>\n';
      output += '<span class="subagent-title">Subagent Execution Details</span>\n';
      output += '<span class="toggle-icon">▼</span>\n';
      output += '</summary>\n';
      output += '<div class="subagent-content">\n';
      output += this.formatSubagentMessages(subagentContent);
      output += '</div>\n';
      output += '</details>\n';
    }

    // 添加Tool Result（在tool-call-content内）
    if (toolResult) {
      output += this.formatToolResultCollapsible(toolResult);
    }

    output += '</div>\n';  // 结束 tool-call-content
    output += '</details>\n';  // 结束 tool-call-details

    return output;
  }

  /**
   * 格式化Tool Result
   */
  formatToolResult(toolResult: ToolResultContentItem): string {
    const content = toolResult.content || '';
    let textContent = '';

    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'text') {
          textContent += typeof item.text === 'string' ? item.text : '';
        }
      }
    } else if (typeof content === 'string') {
      textContent = content;
    }

    if (this.formatType === 'markdown') {
      return `**Result:**\n\`\`\`\n${textContent}\n\`\`\`\n\n`;
    }

    return `<div class="tool-result">\n<strong>Result:</strong>\n<pre>${this.escapeHtml(textContent)}</pre>\n</div>\n`;
  }

  /**
   * 格式化Tool Result（作为section嵌入tool-call-content）
   */
  formatToolResultCollapsible(toolResult: ToolResultContentItem): string {
    const content = toolResult.content || '';
    let textContent = '';

    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'text') {
          textContent += typeof item.text === 'string' ? item.text : '';
        }
      }
    } else if (typeof content === 'string') {
      textContent = content;
    }

    if (this.formatType === 'markdown') {
      return this.formatToolResult(toolResult);
    }

    // HTML格式 - 作为section显示在tool-call-content内
    let output = '<div class="tool-section tool-result-section">\n';
    output += '<h5>📤 执行结果</h5>\n';
    output += `<pre data-markdown-text="${this.escapeHtml(textContent)}"><code>${this.escapeHtml(textContent)}</code></pre>\n`;
    output += '</div>\n';

    return output;
  }

  /**
   * 格式化subagent消息列表
   */
  formatSubagentMessages(messages: ConversationRecord[]): string {
    let output = '';

    // 为subagent构建全局tool_result映射和已处理集合
    const subagentToolResultMap = this.buildToolResultMapGlobal(messages);
    const subagentProcessedToolResults = new Set<string>();

    for (const msg of messages) {
      if (!msg || !msg.message) {
        continue;
      }
      // 将timestamp注入到message对象中，便于processMessage使用
      const msgTime = msg.timestamp;
      if (msg.message && msgTime) {
        msg.message.timestamp = msgTime;
      }
      output += this.processMessage(msg.message, true, null, msgTime, subagentToolResultMap, subagentProcessedToolResults);
    }

    return output;
  }

  /**
   * 构建tool_result映射（全局，遍历所有消息）
   * 返回Map<toolUseId, {result: toolResult, timestamp: msgTimestamp}>
   */
  buildToolResultMapGlobal(messages: ConversationRecord[]): Map<string, ToolResultData> {
    const toolResultMap = new Map<string, ToolResultData>();

    for (const msg of messages) {
      const content = msg.message?.content;
      if (!Array.isArray(content)) {
        continue;
      }

      for (const item of content) {
        if (item.type === 'tool_result') {
          const toolUseId = item.tool_use_id;
          if (typeof toolUseId === 'string' && toolUseId) {
            // 存储tool_result和对应的时间戳
            toolResultMap.set(toolUseId, {
              result: item as ToolResultContentItem,
              timestamp: msg.timestamp
            });
          }
        }
      }
    }

    return toolResultMap;
  }

  /**
   * 构建tool_result映射（单个消息）
   */
  buildToolResultMap(content: MessageContent): Map<string, ToolResultData> {
    const toolResultMap = new Map<string, ToolResultData>();

    if (!Array.isArray(content)) {
      return toolResultMap;
    }

    for (const item of content) {
      if (item.type === 'tool_result') {
        const toolUseId = item.tool_use_id;
        if (typeof toolUseId === 'string' && toolUseId) {
          toolResultMap.set(toolUseId, {
            result: item as ToolResultContentItem,
            timestamp: undefined
          });
        }
      }
    }

    return toolResultMap;
  }

  /**
   * 处理单条消息
   */
  processMessage(
    message: ConversationMessage,
    isSubagent = false,
    sessionDir: string | null = null,
    msgTime: string | null = null,
    globalToolResultMap: Map<string, ToolResultData> | null = null,
    globalProcessedToolResults: Set<string> | null = null
  ): string {
    const output: string[] = [];
    const role = message.role || 'unknown';
    const content = message.content || '';

    // 构建tool_result映射（优先使用全局映射）
    const toolResultMap = globalToolResultMap || this.buildToolResultMap(content);
    const processedToolResults = globalProcessedToolResults || new Set<string>();

    // 用于跟踪是否有实际内容
    let hasActualContent = false;

    // 角色标识和时间戳
    const timestamp = message.timestamp;
    let timestampStr = '';
    if (timestamp) {
      try {
        const dt = new Date(timestamp);
        timestampStr = dt.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
      } catch (e) {
        timestampStr = '';
      }
    }

    if (this.formatType === 'markdown') {
      const roleIcon = role === 'user' ? '👤' : '🤖';
      const roleName = role === 'user' ? 'User' : 'Assistant';
      if (timestampStr) {
        output.push(`## ${roleIcon} ${roleName} - ${timestampStr}\n\n`);
      } else {
        output.push(`## ${roleIcon} ${roleName}\n\n`);
      }
    } else {
      const className = isSubagent ? `message ${role} subagent-message` : `message ${role}`;
      output.push(`<div class="${className}">\n`);
      const roleIcon = role === 'user' ? '👤' : '🤖';
      const roleName = role === 'user' ? 'User' : 'Assistant';

      // Role和时间戳放在同一行
      if (timestampStr) {
        output.push(`<div class="role"><span class="role-icon">${roleIcon}</span><span class="role-name">${roleName}</span><span class="timestamp">${timestampStr}</span></div>\n`);
      } else {
        output.push(`<div class="role"><span class="role-icon">${roleIcon}</span><span class="role-name">${roleName}</span></div>\n`);
      }
    }

    // 记录content开始前的output长度
    // 处理content
    if (typeof content === 'string') {
      // 简单文本内容
      if (this.formatType === 'markdown') {
        output.push(content + '\n\n');
        hasActualContent = true;
      } else {
        output.push(`<div class="content" data-markdown-text="${this.escapeHtml(content)}"></div>\n`);
        hasActualContent = true;
      }
    } else if (Array.isArray(content)) {
      // 复杂内容（包含工具调用、thinking等）
      for (const item of content) {
        if (!item || typeof item !== 'object') continue;

        const itemType = item.type;

        if (itemType === 'text') {
          const text = typeof item.text === 'string' ? item.text : '';
          output.push(this.formatTextWithCollapse(text));
          hasActualContent = true;
        } else if (itemType === 'thinking') {
          // 默认不显示thinking
          continue;
        } else if (itemType === 'tool_use') {
          const toolUseItem = item as ToolUseContentItem;
          // 如果是Agent工具且不是subagent中的消息，尝试加载subagent内容
          let subagentContent: ConversationRecord[] | null = null;
          if (toolUseItem.name === 'Agent' && !isSubagent && sessionDir) {
            const toolUseId = toolUseItem.id;

            // 优先从tool_result_map中查找对应的结果并提取agent ID
            let agentId = null;
            if (toolUseId && toolResultMap.has(toolUseId)) {
              const toolResultData = toolResultMap.get(toolUseId);
              if (toolResultData) {
                const resultContent = toolResultData.result.content;
                agentId = this.extractAgentIdFromToolResult(resultContent);
              }
            }

            // 如果成功提取agent ID，通过ID查找subagent文件
            let subagentFile = null;
            if (agentId) {
              subagentFile = this.findSubagentFileById(sessionDir, agentId);
            }

            // 如果没有找到，回退到时间戳匹配方法
            if (!subagentFile && msgTime) {
              subagentFile = this.findSubagentFile(sessionDir, msgTime);
            }

            // 加载subagent内容
            if (subagentFile) {
              const fileId = path.basename(subagentFile, '.jsonl');
              if (!this.subagentContents.has(fileId)) {
                subagentContent = this.parseSubagent(subagentFile);
                this.subagentContents.set(fileId, subagentContent);
              } else {
                subagentContent = this.subagentContents.get(fileId) ?? null;
              }
            }
          }

          // 查找对应的tool_result和时间戳
          let toolResultData: ToolResultData | null = null;
          const toolId = toolUseItem.id;
          if (toolId && toolResultMap.has(toolId)) {
            toolResultData = toolResultMap.get(toolId) ?? null;
            processedToolResults.add(toolId);
          }

          // 传递tool_use开始时间（当前消息时间）和tool_result数据
          output.push(this.formatToolUseCollapsible(toolUseItem, subagentContent, toolResultData, message.timestamp ?? null));
          hasActualContent = true;
        } else if (itemType === 'tool_result') {
          const toolResultItem = item as ToolResultContentItem;
          // 检查此tool_result是否已在tool_use中处理
          const toolUseId = toolResultItem.tool_use_id;
          if (typeof toolUseId === 'string' && processedToolResults.has(toolUseId)) {
            // 已处理，跳过
            continue;
          } else {
            // 独立显示（理论上不应该发生）
            output.push(this.formatToolResultCollapsible(toolResultItem));
            hasActualContent = true;
          }
        }
      }
    }

    // 检查是否有实际内容
    if (!hasActualContent && this.formatType === 'html') {
      // 如果没有实际内容，返回空字符串（不显示空消息）
      return '';
    }

    if (this.formatType === 'html') {
      output.push('</div>\n');
    }

    return output.join('');
  }

  /**
   * 生成HTML模板
   */
  generateHtmlTemplate(bodyContent: string, sessionId: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude对话导出 - ${sessionId}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown.min.css">
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #24292e;
      background-color: #f6f8fa;
      margin: 0;
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    h1 {
      color: #0969da;
      border-bottom: 2px solid #d0d7de;
      padding-bottom: 10px;
      margin-bottom: 30px;
    }

    .message {
      margin: 25px 0;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #0969da;
      background-color: #f6f8fa;
    }

    .message.user {
      border-left-color: #8250df;
      background-color: #fbefff;
    }

    .message.assistant {
      border-left-color: #1f883d;
      background-color: #dafbe1;
    }

    .subagent-message {
      margin-left: 20px;
      border-left: 3px dashed #0969da;
      background-color: #fff;
      font-size: 0.95em;
    }

    .role {
      font-weight: 600;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.1em;
    }

    .role-icon {
      font-size: 1.3em;
    }

    .role-name {
      flex: 0 0 auto;
    }

    .timestamp {
      font-size: 0.8em;
      color: #57606a;
      font-weight: 400;
      margin-left: auto;
      opacity: 0.8;
    }

    .content {
      margin: 15px 0;
      word-wrap: break-word;
    }

    .content pre {
      white-space: pre-wrap;
    }

    .markdown-body {
      background-color: transparent !important;
      padding: 10px 0;
    }

    .tool-call-details, .tool-result-details, .subagent-details {
      margin: 15px 0;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      overflow: hidden;
    }

    .subagent-details {
      margin-top: 15px;
      border: 2px solid #0969da;
      background-color: #f0f6ff;
    }

    .tool-call-summary, .tool-result-summary, .subagent-summary {
      padding: 12px 15px;
      background-color: #f6f8fa;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 500;
      user-select: none;
    }

    .subagent-summary {
      background-color: #ddf4ff;
    }

    .tool-call-summary:hover, .tool-result-summary:hover, .subagent-summary:hover {
      background-color: #e7ecf0;
    }

    .tool-icon, .result-icon, .subagent-icon {
      font-size: 1.2em;
    }

    .tool-name {
      color: #0969da;
      font-weight: 600;
    }

    .tool-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75em;
      font-weight: 500;
      background-color: #ddf4ff;
      color: #0969da;
      margin-left: 8px;
    }

    .agent-badge {
      background-color: #ddf4ff;
      color: #0969da;
    }

    .tool-description {
      color: #57606a;
      flex: 1;
      margin-left: 8px;
    }

    .tool-timing {
      font-size: 0.75em;
      color: #57606a;
      font-weight: 400;
      padding: 2px 8px;
      background-color: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      white-space: nowrap;
    }

    .toggle-icon {
      margin-left: auto;
      transition: transform 0.2s;
    }

    details[open] > summary .toggle-icon {
      transform: rotate(180deg);
    }

    .tool-call-content, .tool-result-content, .subagent-content {
      padding: 15px;
      background-color: white;
    }

    .subagent-content {
      background-color: #fff;
      border-top: 1px solid #0969da;
    }

    .tool-section {
      margin: 15px 0;
    }

    .tool-section h5 {
      margin: 0 0 10px 0;
      font-size: 0.9em;
      font-weight: 600;
      color: #57606a;
    }

    .tool-result-section {
      border-top: 1px solid #d0d7de;
      padding-top: 15px;
      margin-top: 20px;
    }

    pre {
      background-color: #f6f8fa;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 10px 0;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 0.9em;
    }

    .toggle-button {
      margin-top: 10px;
      padding: 8px 16px;
      background-color: #f6f8fa;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9em;
      color: #0969da;
      transition: background-color 0.2s;
    }

    .toggle-button:hover {
      background-color: #e7ecf0;
    }

    .collapsible-content {
      margin: 15px 0;
    }

    .hidden-content {
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Claude对话导出 - Session ${sessionId}</h1>
    ${bodyContent}
  </div>

  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"></script>
  <script>
    // 配置marked
    marked.setOptions({
      breaks: true,
      gfm: true
    });

    // 渲染所有markdown内容
    document.addEventListener('DOMContentLoaded', () => {
      const elements = document.querySelectorAll('[data-markdown-text]');
      elements.forEach(el => {
        const markdownText = el.getAttribute('data-markdown-text');
        if (markdownText) {
          const html = marked.parse(markdownText);
          el.innerHTML = '<div class="markdown-body">' + html + '</div>';
        }
      });
    });
  </script>
</body>
</html>`;
  }

  /**
   * 导出会话
   */
  exportConversation(jsonlPath: string, outputPath: string, log: boolean = false, cwdPath: string | null = null): ExportResult {
    // 读取JSONL文件
    const content = fs.readFileSync(jsonlPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    const messages: ConversationRecord[] = [];
    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as ConversationRecord;
        // 只保留包含message字段的记录
        if (msg.message) {
          messages.push(msg);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        log && console.warn(`Warning: Failed to parse line: ${message}`);
      }
    }

    if (messages.length === 0) {
      throw new Error('No valid messages found in JSONL file');
    }

    // 获取session目录
    let sessionDir: string | null = null;
    if (cwdPath) {
      const basename = path.basename(jsonlPath, '.jsonl');
      const jsonlDir = path.dirname(jsonlPath);

      // 先尝试在同目录下查找session目录
      const possibleSessionDirs = fs.readdirSync(jsonlDir)
        .filter((d: string) => d.startsWith(basename))
        .map(d => path.join(jsonlDir, d))
        .filter(d => fs.statSync(d).isDirectory());

      if (possibleSessionDirs.length > 0) {
        sessionDir = possibleSessionDirs[0];
      }
    }

    // 获取文件信息
    const stats = fs.statSync(jsonlPath);
    const sessionId = path.basename(jsonlPath, '.jsonl');

    log && console.log(`✓ 处理会话: ${sessionId}`);
    log && console.log(`  文件路径: ${jsonlPath}`);
    log && console.log(`  修改时间: ${stats.mtime}`);

    // 构建全局tool_result映射和已处理集合
    const globalToolResultMap = this.buildToolResultMapGlobal(messages);
    const globalProcessedToolResults = new Set<string>();

    // 处理消息
    const bodyParts: string[] = [];
    for (const msg of messages) {
      const msgTime = msg.timestamp;  // timestamp在msg顶层，不在msg.message中
      // 将timestamp添加到message对象中，便于processMessage使用
      if (msg.message && msgTime) {
        msg.message.timestamp = msgTime;
      }
      if (!msg.message) {
        continue;
      }
      const html = this.processMessage(msg.message, false, sessionDir, msgTime ?? null, globalToolResultMap, globalProcessedToolResults);
      bodyParts.push(html);
    }

    const bodyContent = bodyParts.join('\n');

    // 生成输出
    let finalContent: string;
    if (this.formatType === 'html') {
      finalContent = this.generateHtmlTemplate(bodyContent, sessionId);
    } else {
      finalContent = `# Claude对话导出 - Session ${sessionId}\n\n${bodyContent}`;
    }

    // 写入文件
    fs.writeFileSync(outputPath, finalContent, 'utf-8');

    const outputStats = fs.statSync(outputPath);
    const fileSizeKB = (outputStats.size / 1024).toFixed(1);
    const subagentCount = this.subagentContents.size;

    log && console.log(`✓ 会话已导出: ${outputPath}`);
    log && console.log(`  文件大小: ${fileSizeKB} KB`);
    if (subagentCount > 0) {
      log && console.log(`  包含subagent: ${subagentCount}个 (已内联显示)`);
    }

    return {
      success: true,
      outputPath,
      fileSize: fileSizeKB,
      subagentCount
    };
  }
}

/**
 * 查找当前工作目录对应的最新conversation
 */
function findLatestConversation(cwdPath?: string): string {
  const homedir = os.homedir();
  const claudeProjectsBase = path.join(homedir, '.claude', 'projects');

  if (!fs.existsSync(claudeProjectsBase)) {
    throw new Error('Claude projects directory not found');
  }

  // 确定当前工作目录
  const targetCwd = cwdPath || process.cwd();

  // 构建projects目录名称：将路径转换为-Users-xxx-workspace格式
  // 例如：/Users/heke/.claude/workspace-2 -> -Users-heke--claude-workspace-2
  const normalizedPath = targetCwd.replace(/\//g, '-');

  // 查找匹配的projects目录
  const allProjectDirs = fs.readdirSync(claudeProjectsBase);

  // 精确匹配
  let projectDir = allProjectDirs.find((d: string) => d === normalizedPath);

  // 如果没有精确匹配，尝试查找包含路径的目录
  if (!projectDir) {
    // 提取workspace目录名（最后一部分）
    const workspaceName = path.basename(targetCwd);
    const possibleMatches = allProjectDirs.filter((d: string) => d.endsWith(workspaceName));

    if (possibleMatches.length === 0) {
      throw new Error(`No Claude project found for workspace: ${targetCwd}\n提示：检查 ~/.claude/projects/ 目录`);
    }

    projectDir = possibleMatches[0];
  }

  const fullProjectDir = path.join(claudeProjectsBase, projectDir);

  // 查找所有.jsonl文件
  const jsonlFiles = fs.readdirSync(fullProjectDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => {
      const filePath = path.join(fullProjectDir, f);
      const stats = fs.statSync(filePath);
      return { path: filePath, mtime: stats.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // 按修改时间降序排列

  if (jsonlFiles.length === 0) {
    throw new Error(`No conversation files found in: ${fullProjectDir}`);
  }

  return jsonlFiles[0].path;
}

// /**
//  * 命令行入口
//  */
// function main(): void {
//   program
//     .name('claude-export')
//     .description('导出Claude Code对话为HTML或Markdown格式')
//     .version('2.4.0')
//     .argument('[jsonl_file]', 'JSONL对话文件路径（可选，默认为当前目录最新conversation）')
//     .option('-f, --format <type>', '导出格式: html 或 markdown', 'markdown')
//     .option('-o, --output <path>', '输出文件路径')
//     .option('--cwd <path>', '工作目录路径（用于查找subagent文件和自动查找conversation）')
//     .action((jsonlFile: string | undefined, options: { format: FormatType; output?: string; cwd?: string }) => {
//       try {
//         // 如果没有提供文件，自动查找最新的
//         if (!jsonlFile) {
//           console.log('🔍 未指定文件，查找最新conversation...\n');
//           jsonlFile = findLatestConversation(options.cwd);
//           console.log(`✓ 找到: ${jsonlFile}\n`);
//         }

//         // 确定输出路径
//         let outputPath = options.output;
//         if (!outputPath) {
//           const basename = path.basename(jsonlFile, '.jsonl');
//           const ext = options.format === 'html' ? 'html' : 'md';
//           outputPath = path.join(process.cwd(), `${basename}.${ext}`);
//         }

//         // 如果没有明确指定cwd，使用当前目录
//         const cwdPath = options.cwd || process.cwd();

//         // 创建导出器
//         const exporter = new ConversationExporter(options.format);

//         // 导出
//         exporter.exportConversation(jsonlFile, outputPath, cwdPath);

//         console.log('\n🎉 导出完成!\n');

//         process.exit(0);
//       } catch (error: unknown) {
//         const message = error instanceof Error ? error.message : String(error);
//         console.error(`\n❌ 错误: ${message}\n`);
//         process.exit(1);
//       }
//     });

//   program.parse();
// }

// // 执行
// if (require.main === module) {
//   main();
// }

const exporter = new ConversationExporter('html');

export { exporter };
