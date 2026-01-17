# Introspector

An Obsidian plugin for AI-guided self-reflection and insight discovery.

## What it does

Introspector opens a conversational sidebar where an AI guide helps you explore your thoughts through thoughtful questions. Each session begins with a haiku and unfolds through a dialogue that alternates between open-ended questions and structured options to help you drill deeper into what's on your mind.

When you reach an insight, the plugin captures your conversation as a note—complete with extracted insights and links to related notes in your vault.

## Features

- **Three conversation styles**: Socratic Guide (philosophical, probing), Warm Therapist (empathetic, validating), or Direct Challenger (incisive, assumption-testing)
- **Vault-aware context**: Optionally pull context from specific folders or tagged notes to personalize the conversation
- **Insight capture**: Finish a session to generate a summary note with key insights and automatic links to related notes
- **Flexible providers**: Works with Anthropic API directly or via OpenRouter (supporting other models like GPT-4)

## Setup

1. Install and enable the plugin
2. Open **Settings → Introspector**
3. Choose your provider (Anthropic or OpenRouter)
4. Enter your API key
5. Optionally configure:
   - Save folder for introspection notes
   - Context folders and tags to inform the conversation
   - Default personality style

## Usage

Click the brain icon in the ribbon or run the command **Start introspection session**.

Share what's on your mind. The guide will reflect back observations and ask questions to help you go deeper. When you feel you've reached clarity, click **Finish** to save your insights.

## Requirements

- An API key from [Anthropic](https://console.anthropic.com/) or [OpenRouter](https://openrouter.ai/)
