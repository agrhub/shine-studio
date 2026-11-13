<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/utils/utils';
import { Separator } from '@/components/ui/separator';

interface ShortcutsModalProps {
  open: boolean;
}

defineProps<ShortcutsModalProps>();
const emit = defineEmits(['update:open']);
const { t } = useI18n();

interface ShortcutItem {
  label: string;
  keys: string[];
  disabled?: boolean;
}

interface ShortcutCategory {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUTS: ShortcutCategory[] = [
  {
    title: 'Globe',
    items: [
      { label: 'Select all', keys: ['⌘', 'A'] },
      {
        label: 'Select multiple clips',
        keys: ['⇧', 'Left-Click'],
      },
      { label: 'Copy', keys: ['⌘', 'C'] },
      { label: 'Cut', keys: ['⌘', 'X'] },
      { label: 'Paste', keys: ['⌘', 'V'] },
      { label: 'Delete', keys: ['⌫'] },
      { label: 'Undo', keys: ['⌘', 'Z'] },
      { label: 'Redo', keys: ['⇧', '⌘', 'Z'] },
      { label: 'Play or pause', keys: ['Space'] },
      { label: 'Text wrap', keys: ['⌘', 'Enter'], disabled: true },
      { label: 'Split sentence', keys: ['Enter'], disabled: true },
    ],
  },
  {
    title: 'Timeline',
    items: [
      { label: 'Split', keys: ['⌘', 'B'] },
      { label: 'Keep left of playhead', keys: ['W'] },
      { label: 'Keep right of playhead', keys: ['Q'] },
      { label: 'Zoom in', keys: ['⌘', '+'] },
      { label: 'Zoom out', keys: ['⌘', '-'] },
      { label: 'Scroll up or down', keys: ['Scroll'], disabled: true },
      { label: 'Scroll left or right', keys: ['⇧', 'Scroll'], disabled: true },
      { label: 'Last frame', keys: ['⌘', '←'] },
      { label: 'Next frame', keys: ['⌘', '→'] },
      { label: 'Turn on or off preview axis', keys: ['S'], disabled: true },
      { label: 'Attach', keys: ['N'], disabled: true },
      { label: 'Separate audio', keys: ['⇧', '⌘', 'S'] },
      { label: 'Add or remove beats', keys: ['M'], disabled: true },
    ],
  },
  {
    title: 'Canvas',
    items: [
      { label: 'Full screen', keys: ['⇧', '⌘', 'F'], disabled: true },
      { label: 'Move', keys: ['V'], disabled: true },
      { label: 'Hand tool', keys: ['H'], disabled: true },
      { label: 'Zoom in', keys: ['⇧', '+'], disabled: true },
      { label: 'Zoom out', keys: ['⇧', '-'], disabled: true },
      { label: 'Zoom to fit', keys: ['⇧', 'F'], disabled: true },
      { label: 'Zoom to 50%', keys: ['⇧', '0'], disabled: true },
      { label: 'Zoom to 100%', keys: ['⇧', '1'], disabled: true },
      { label: 'Zoom to 200%', keys: ['⇧', '2'], disabled: true },
      { label: 'Move up 1 px', keys: ['↑'] },
      { label: 'Move down 1 px', keys: ['↓'] },
      { label: 'Move left 1 px', keys: ['←'] },
      { label: 'Move right 1 px', keys: ['→'] },
      { label: 'Move 5 px', keys: ['⇧', 'Arrow Keys'] },
    ],
  },
];
</script>

<template>
  <Dialog :open="open" @update:open="(val) => emit('update:open', val)">
    <DialogContent class="md:max-w-5xl w-full max-w-5xl border bg-card p-6 py-8 overflow-hidden">
      <DialogHeader class="px-6">
        <DialogTitle class="text-lg font-semibold">{{ t('editor.shortcuts') }}</DialogTitle>
      </DialogHeader>
      <div class="px-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div
            v-for="(category, index) in SHORTCUTS"
            :key="category.title"
            class="flex flex-col gap-6 relative"
          >
            <h3 class="text-sm font-semibold">{{ category.title }}</h3>
            <div class="flex flex-col gap-5">
              <div
                v-for="item in category.items"
                :key="item.label"
                :class="cn(
                  'flex items-center justify-between text-sm',
                  item.disabled ? 'opacity-40' : ''
                )"
              >
                <span class="text-zinc-300">{{ item.label }}</span>
                <div class="flex gap-2">
                  <Kbd
                    v-for="(key, i) in item.keys"
                    :key="i"
                    class="bg-zinc-800 border-zinc-700 text-zinc-300 min-w-6"
                  >
                    {{ key }}
                  </Kbd>
                </div>
              </div>
            </div>
            <!-- Separators -->
            <div v-if="index < SHORTCUTS.length - 1" class="md:hidden">
              <Separator class="my-4 bg-zinc-800" />
            </div>
            <div v-if="index < SHORTCUTS.length - 1" class="hidden md:block absolute -right-4 top-0 bottom-0 w-[1px] bg-zinc-800" />
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
