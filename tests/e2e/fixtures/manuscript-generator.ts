import { writeFile, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export interface ManuscriptFixture {
  path: string;
  content: string;
  wordCount: number;
  chapters: number;
  scenes: number;
  spoilerViolations: number;
}

interface GeneratorOptions {
  wordCount: number;
  chapters?: number;
  includeDialogue?: boolean;
  includeSpoilers?: boolean;
  includeCharacterInconsistencies?: boolean;
}

export class ManuscriptGenerator {
  private templates = {
    openings: [
      "The alarm clock screamed at 6 AM, but Detective",
      "Rain pelted the windows of the abandoned warehouse where",
      "Sarah never expected to find a dead body in",
      "The phone call came at midnight, changing everything",
      "Blood pooled around the victim's head, suggesting"
    ],
    
    characters: [
      "Detective Sarah Martinez", "Dr. Jonathan Smith", "Professor Emily Watson",
      "Agent Michael Johnson", "Captain Robert Hayes", "Detective Lisa Chen",
      "Dr. Amanda Rodriguez", "Officer David Thompson"
    ],
    
    locations: [
      "the university laboratory", "the downtown precinct", "the old warehouse district",
      "the victim's apartment", "the medical examiner's office", "the police station",
      "the crime scene", "the suspect's hideout"
    ],
    
    actions: [
      "examined the evidence carefully", "questioned the witness", "analyzed the blood spatter",
      "reviewed the security footage", "checked the alibis", "processed the crime scene",
      "interviewed the suspect", "followed the lead"
    ],
    
    spoilerPhrases: [
      "the serial killer who would be caught in chapter 12",
      "the murderer turned out to be the victim's brother",
      "the real culprit was hiding in plain sight all along",
      "the final twist revealed the truth about the conspiracy",
      "the killer's identity was discovered through DNA evidence"
    ],
    
    dialogue: [
      '"This doesn\'t make sense," Martinez muttered.',
      '"We need to check the victim\'s background," Johnson suggested.',
      '"The evidence points to an inside job," Chen observed.',
      '"I\'ve never seen anything like this before," the rookie admitted.',
      '"The killer made a mistake - they always do," Hayes said confidently.'
    ]
  };

  async generateTestManuscript(options: GeneratorOptions): Promise<ManuscriptFixture> {
    const {
      wordCount,
      chapters = Math.ceil(wordCount / 10000),
      includeDialogue = true,
      includeSpoilers = true,
      includeCharacterInconsistencies = true
    } = options;

    let content = this.generateTitle();
    let currentWordCount = 0;
    let totalScenes = 0;
    let spoilerCount = 0;

    for (let chapterNum = 1; chapterNum <= chapters && currentWordCount < wordCount; chapterNum++) {
      const chapterContent = await this.generateChapter(
        chapterNum,
        Math.floor(wordCount / chapters),
        {
          includeDialogue,
          includeSpoilers: includeSpoilers && Math.random() > 0.3,
          includeCharacterInconsistencies: includeCharacterInconsistencies && Math.random() > 0.4
        }
      );
      
      content += chapterContent.text;
      currentWordCount += chapterContent.wordCount;
      totalScenes += chapterContent.scenes;
      spoilerCount += chapterContent.spoilers;
    }

    // Create temporary file
    const tmpDir = await mkdtemp(join(tmpdir(), 'smairs-test-'));
    const manuscriptPath = join(tmpDir, 'test-manuscript.txt');
    await writeFile(manuscriptPath, content, 'utf-8');

    return {
      path: manuscriptPath,
      content,
      wordCount: this.countWords(content),
      chapters,
      scenes: totalScenes,
      spoilerViolations: spoilerCount
    };
  }

  private generateTitle(): string {
    const titles = [
      "The Detective's Last Case",
      "Blood on the Laboratory Floor", 
      "Shadows in the Precinct",
      "The Midnight Murders",
      "Evidence of Betrayal"
    ];
    
    return `# ${titles[Math.floor(Math.random() * titles.length)]}\n\n`;
  }

  private async generateChapter(
    chapterNum: number,
    targetWords: number,
    options: {
      includeDialogue: boolean;
      includeSpoilers: boolean;
      includeCharacterInconsistencies: boolean;
    }
  ): Promise<{
    text: string;
    wordCount: number;
    scenes: number;
    spoilers: number;
  }> {
    let text = `## Chapter ${chapterNum}\n\n`;
    let wordCount = 0;
    let scenes = 0;
    let spoilers = 0;
    
    const scenesInChapter = Math.max(2, Math.floor(targetWords / 1000));
    
    for (let sceneNum = 1; sceneNum <= scenesInChapter && wordCount < targetWords; sceneNum++) {
      const sceneContent = this.generateScene(
        chapterNum,
        sceneNum,
        Math.floor(targetWords / scenesInChapter),
        options
      );
      
      text += sceneContent.text;
      wordCount += sceneContent.wordCount;
      spoilers += sceneContent.spoilers;
      scenes++;
    }
    
    return { text, wordCount, scenes, spoilers };
  }

  private generateScene(
    chapterNum: number,
    sceneNum: number,
    targetWords: number,
    options: {
      includeDialogue: boolean;
      includeSpoilers: boolean;
      includeCharacterInconsistencies: boolean;
    }
  ): {
    text: string;
    wordCount: number;
    spoilers: number;
  } {
    let text = `### Scene ${sceneNum}\n\n`;
    let wordCount = 0;
    let spoilers = 0;
    
    // Generate opening sentence
    const opening = this.getRandomElement(this.templates.openings);
    const character = this.getRandomElement(this.templates.characters);
    const location = this.getRandomElement(this.templates.locations);
    
    text += `${opening} ${character} arrived at ${location}. `;
    
    // Generate main content paragraphs
    const paragraphs = Math.floor(targetWords / 100);
    
    for (let p = 0; p < paragraphs; p++) {
      const paragraphText = this.generateParagraph(options);
      text += paragraphText.text + '\n\n';
      wordCount += paragraphText.wordCount;
      spoilers += paragraphText.spoilers;
      
      if (wordCount >= targetWords) break;
    }
    
    return { text, wordCount, spoilers };
  }

  private generateParagraph(options: {
    includeDialogue: boolean;
    includeSpoilers: boolean;
    includeCharacterInconsistencies: boolean;
  }): {
    text: string;
    wordCount: number;
    spoilers: number;
  } {
    const sentences = Math.floor(Math.random() * 4) + 2; // 2-5 sentences
    let text = '';
    let spoilers = 0;
    
    for (let s = 0; s < sentences; s++) {
      if (options.includeDialogue && Math.random() > 0.7) {
        // Add dialogue
        text += this.getRandomElement(this.templates.dialogue) + ' ';
      } else if (options.includeSpoilers && Math.random() > 0.9) {
        // Add spoiler
        text += `The investigation revealed that ${this.getRandomElement(this.templates.spoilerPhrases)}. `;
        spoilers++;
      } else {
        // Regular narrative
        const character = this.getRandomElement(this.templates.characters);
        const action = this.getRandomElement(this.templates.actions);
        const location = this.getRandomElement(this.templates.locations);
        
        text += `${character} ${action} at ${location}. `;
        
        // Add character inconsistency occasionally
        if (options.includeCharacterInconsistencies && Math.random() > 0.95) {
          text += `Later, ${character} was referred to as Detective Smith. `;
        }
      }
    }
    
    return {
      text: text.trim(),
      wordCount: this.countWords(text),
      spoilers
    };
  }

  private getRandomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)]!;
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  // Pre-built test manuscripts for different scenarios
  async generateSmallManuscript(): Promise<ManuscriptFixture> {
    return this.generateTestManuscript({
      wordCount: 1000,
      chapters: 2,
      includeDialogue: true,
      includeSpoilers: true
    });
  }

  async generateMediumManuscript(): Promise<ManuscriptFixture> {
    return this.generateTestManuscript({
      wordCount: 25000,
      chapters: 5,
      includeDialogue: true,
      includeSpoilers: true,
      includeCharacterInconsistencies: true
    });
  }

  async generateLargeManuscript(): Promise<ManuscriptFixture> {
    return this.generateTestManuscript({
      wordCount: 120000,
      chapters: 12,
      includeDialogue: true,
      includeSpoilers: true,
      includeCharacterInconsistencies: true
    });
  }

  async generatePerfectManuscript(): Promise<ManuscriptFixture> {
    return this.generateTestManuscript({
      wordCount: 15000,
      chapters: 3,
      includeDialogue: true,
      includeSpoilers: false,
      includeCharacterInconsistencies: false
    });
  }
}

// Export convenience functions
export const generateTestManuscript = (wordCount: number) => 
  new ManuscriptGenerator().generateTestManuscript({ wordCount });

export const loadLargeManuscript = () => 
  new ManuscriptGenerator().generateLargeManuscript();

export const loadMediumManuscript = () => 
  new ManuscriptGenerator().generateMediumManuscript();

export const loadSmallManuscript = () => 
  new ManuscriptGenerator().generateSmallManuscript();