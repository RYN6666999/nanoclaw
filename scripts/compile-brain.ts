import fs from 'fs';
import path from 'path';

function compileBrain() {
    const skillsDir = path.join(process.cwd(), 'skills');
    const brainPath = path.join(skillsDir, 'brain.json');

    if (!fs.existsSync(skillsDir)) return;

    const brain: Record<string, string> = {};
    const folders = fs.readdirSync(skillsDir);

    for (const folder of folders) {
        const skillPath = path.join(skillsDir, folder, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
            // Basic compression: strip comments and excessive whitespace
            const content = fs.readFileSync(skillPath, 'utf-8')
                .replace(/<!--[\s\S]*?-->/g, '')
                .replace(/\n\s*\n/g, '\n')
                .trim();
            brain[folder] = content;
        }
    }

    fs.writeFileSync(brainPath, JSON.stringify(brain), 'utf-8');
    console.log('Brain compiled at:', brainPath);
}

compileBrain();
