import {
  ComponentInitData,
  ComponentInstance,
  ContentType,
  defineComponent,
  onContentInsert,
  Selection,
  Slot,
  SlotRender,
  useContext,
  useSelf,
  useSlots,
  VElement,
} from '@textbus/core';
import { ComponentLoader, SlotParser } from '@textbus/browser';
import { Injector } from '@tanbo/di';

export interface MentionComponentOption {
  id: string;
  username: string;
}

export const mentionComponent = defineComponent({
  type: ContentType.InlineComponent,
  name: 'MentionComponent',
  setup(initData?: ComponentInitData<void>) {
    const slots = useSlots(initData?.slots || [new Slot([ContentType.Text])]);

    const self = useSelf();

    let options: MentionComponentOption[] = [];

    const injector = useContext();

    const selection = injector.get(Selection);

    onContentInsert((ev) => {
      const t = ev.data.content;
      const text = slots.get(0)!.toString() + t;
      setTimeout(() => {
        options = [
          {
            username: text + '张三',
            id: 'fdsafdsafdsa',
          },
          {
            username: text + '李四',
            id: '543543',
          },
        ];
        self.changeMarker.forceMarkDirtied();
      }, 1000);
    });

    return {
      render(isOutputMode: boolean, slotRender: SlotRender): VElement {
        return (
          <span component-name="MentionComponent">
            @
            {slotRender(slots.get(0)!, () => {
              return <span />;
            })}
            <span style="position:relative">
              <div
                style={{
                  position: 'absolute',
                }}
              >
                {options.map((option) => {
                  return (
                    <div
                      style={{
                        whiteSpace: 'nowrap',
                      }}
                      onClick={() => {
                        const slot = slots.get(0)!;
                        slot.retain(0);
                        slot.delete(slot.length);
                        slot.insert(option.username);

                        const parentSlot = self.parent!;

                        const index = parentSlot.indexOf(self);

                        selection.setPosition(parentSlot, index + 1);
                      }}
                    >
                      {option.username}
                    </div>
                  );
                })}
              </div>
            </span>
          </span>
        );
      },
    };
  },
});

export const atComponentLoader: ComponentLoader = {
  match(element: HTMLElement): boolean {
    return element.tagName === 'SPAN' && element.getAttribute('component-name') === 'MentionComponent';
  },
  read(element: HTMLElement, context: Injector, slotParser: SlotParser): ComponentInstance {
    return mentionComponent.createInstance(context, {
      slots: [slotParser(new Slot([ContentType.Text]), element.children[0] as HTMLElement)],
    });
  },
};
