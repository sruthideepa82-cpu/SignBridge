// Ready phrases for everyday situations. These are fixed, reviewed text, not generated output.
// Anyone using them can edit the message before it is shown, spoken or sent.
export const PHRASE_CATEGORIES = [
  {
    id: 'emergency',
    label: 'Emergency',
    description: 'Urgent help. Also shown in Live Studio.',
    phrases: [
      'I need help now.',
      'Please call an ambulance.',
      'I am deaf. Please text the emergency service.',
      'I cannot hear you. Please write it down.',
      'Where is the nearest exit?',
    ],
  },
  {
    id: 'greetings',
    label: 'Greetings',
    description: 'Opening and closing a conversation.',
    phrases: [
      'Hello, how are you?',
      'Good morning.',
      'Good evening.',
      'Nice to meet you.',
      'Goodbye, take care.',
    ],
  },
  {
    id: 'everyday',
    label: 'Everyday conversation',
    description: 'Simple replies and requests.',
    phrases: [
      'Thank you very much.',
      'Please excuse me.',
      'Yes, I agree.',
      'No, thank you.',
      'Can you repeat that, please?',
      'Please face me when you speak.',
    ],
  },
  {
    id: 'help',
    label: 'Help and assistance',
    description: 'Asking for help or clarification.',
    phrases: [
      'Can you help me, please?',
      'I did not understand. Could you explain again?',
      'Could you write it down?',
      'Where is the information desk?',
      'Please show me on the map.',
    ],
  },
  {
    id: 'medical',
    label: 'Medical needs',
    description: 'Describing symptoms and asking for an interpreter.',
    phrases: [
      'I am deaf. Please write down what you need me to know.',
      'I have pain here.',
      'I am allergic to medicine.',
      'Can you explain the treatment slowly?',
      'I need an interpreter for my appointment.',
    ],
  },
  {
    id: 'college',
    label: 'College and workplace',
    description: 'Classes, meetings and work messages.',
    phrases: [
      'May I write my question?',
      'Please send me the instructions in writing.',
      'Can we use a video call for this meeting?',
      'I will reply by message after the meeting.',
      'Please let me know when the decision is made.',
      'Thank you for including me.',
    ],
  },
];

export const ALL_PHRASES = PHRASE_CATEGORIES.flatMap((category) =>
  category.phrases.map((text) => ({ text, categoryId: category.id, categoryLabel: category.label })),
);

export const DEFAULT_CATEGORY = 'everyday';

export function categoryById(id) {
  return PHRASE_CATEGORIES.find((category) => category.id === id) ?? null;
}
