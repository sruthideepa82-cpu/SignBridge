// General-purpose phrases for everyday situations. These are fixed, reviewed text, not generated
// output. Anyone using them can edit the message before it is spoken or shown.
export const PHRASE_CATEGORIES = [
  {
    id: 'healthcare',
    label: 'Healthcare',
    phrases: [
      'I am deaf. Please write down what you need me to know.',
      'I have pain here.',
      'I am allergic to medicine.',
      'Can you explain the treatment slowly?',
      'I need an interpreter for my appointment.',
    ],
  },
  {
    id: 'education',
    label: 'Education',
    phrases: [
      'Can you repeat that, please?',
      'I did not understand. Could you explain again?',
      'May I write my question?',
      'Please face me when you speak.',
      'Thank you for explaining.',
    ],
  },
  {
    id: 'travel',
    label: 'Travel',
    phrases: [
      'Where is the platform for this train?',
      'I need help finding my gate.',
      'How much is the fare to this station?',
      'Please show me on the map.',
      'Is this the right bus?',
    ],
  },
  {
    id: 'shopping',
    label: 'Shopping',
    phrases: [
      'How much does this cost?',
      'Do you have this in another size?',
      'I would like to pay by card.',
      'Can you write the total, please?',
      'Thank you, that is all.',
    ],
  },
  {
    id: 'workplace',
    label: 'Workplace',
    phrases: [
      'I am deaf. Please send me the instructions in writing.',
      'Can we use a video call for this meeting?',
      'I will reply by message after the meeting.',
      'Please let me know when the decision is made.',
      'Thank you for including me.',
    ],
  },
  {
    id: 'emergency',
    label: 'Emergency',
    phrases: [
      'I need help now.',
      'Please call an ambulance.',
      'I am deaf. Please text the emergency service.',
      'I cannot hear you. Please write it down.',
      'Where is the nearest exit?',
    ],
  },
  {
    id: 'everyday',
    label: 'Everyday',
    phrases: [
      'Hello, how are you?',
      'Good morning.',
      'Thank you very much.',
      'Please excuse me.',
      'Yes, I agree.',
      'No, thank you.',
    ],
  },
];

export const ALL_PHRASES = PHRASE_CATEGORIES.flatMap((category) => category.phrases);
