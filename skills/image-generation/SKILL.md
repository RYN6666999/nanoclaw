---
name: image-generation
description: Multi-model image generation supporting DALL-E, Stable Diffusion, local models, and AI image editing. Use when Claude needs to: (1) Generate images from text prompts, (2) Edit/modify existing images, (3) Batch image generation, (4) Style transfer, or (5) Image-to-image transformations.
---
# Image Generation Skill

## Overview

This skill provides multi-model image generation capabilities through various AI models. Claude can use different models based on quality requirements, cost constraints, and available resources.

## Model Selection Guide

| Requirement | Recommended Model | Quality | Speed | Cost |
|-------------|------------------|---------|-------|------|
| **Quick test/experimental** | Local Stable Diffusion | ★★★☆☆ | ⚡⚡ | Free |
| **Cost-effective production** | Stable Diffusion API | ★★★★☆ | ⚡⚡⚡ | $ |
| **Premium quality** | DALL-E 3 | ★★★★★ | ⚡⚡⚡ | $$$ |
| **Artistic style** | Midjourney (if available) | ★★★★★ | ⚡⚡ | $$$ |

## Available Scripts

### 1. `scripts/generate_image_bridge.py`
**Purpose**: Local image generation via DrawThings API
**Usage**: `python3 generate_image_bridge.py "your prompt"`
**Features**: Chinese prompt enhancement via Groq, fast local generation

### 2. `scripts/dalle_generator.py`
**Purpose**: OpenAI DALL-E 3 integration
**Dependencies**: `openai` package
**Setup**: `export OPENAI_API_KEY="your-key"`

### 3. `scripts/sd_api_client.py`
**Purpose**: Stability AI API client
**Dependencies**: `stability-sdk` package
**Setup**: `export STABILITY_API_KEY="your-key"`

### 4. `scripts/local_generator.py`
**Purpose**: Local Stable Diffusion via diffusers
**Dependencies**: `torch`, `diffusers`, `transformers`
**Setup**: Automatic for M1/M2/M3 Mac

## Quick Start

```python
# Example: Generate image with local model
from scripts.generate_image_bridge import generate_image

result = generate_image("A beautiful sunset over mountains, digital art")
print(f"Image saved to: {result[\"path\"]}")
```

## API Configuration

Create `~/.config/image_generation/config.json`:

```json
{
  "openai": {
    "api_key": "your-key-here"
  },
  "stability": {
    "api_key": "your-key-here"
  },
  "local": {
    "model_path": "stabilityai/stable-diffusion-3-medium-diffusers"
  }
}
```

## Integration with AionUI

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "image-generation": {
      "command": "python3",
      "args": ["scripts/image_server.py"],
      "env": {
        "OPENAI_API_KEY": "your-key",
        "STABILITY_API_KEY": "your-key"
      }
    }
  }
}
```

## Usage Examples

### 1. Simple Image Generation
```
User: "Generate a logo for a tech startup"
Action: Use local model for quick generation
```

### 2. High-Quality Commercial Image
```
User: "Create a professional product image for marketing"
Action: Use DALL-E 3 with quality="hd"
```

### 3. Image Editing
```
User: "Remove the background from this image"
Action: Use image editing utilities or DALL-E 3 inpainting
```

## References

See `references/` directory for:
- `api_reference.md` - Complete API documentation
- `model_comparison.md` - Detailed model comparisons
- `prompt_engineering.md` - Best practices for prompts

## Troubleshooting

### Common Issues
1. **API key errors** → Check environment variables
2. **Out of memory** → Reduce image size or use smaller model
3. **Slow generation** → Switch to faster model or reduce steps

### Debug Mode
Enable debug logging:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## License and Compliance

- DALL-E 3: OpenAI Terms of Service
- Stable Diffusion: Stability AI License
- Local models: CreativeML Open RAIL-M License

Always comply with API usage limits and model licenses.
