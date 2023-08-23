/**
 * Copyright 2023 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as Bidi from 'chromium-bidi/lib/cjs/protocol/protocol.js';

import {
  AutofillData,
  ElementHandle as BaseElementHandle,
  ClickOptions,
} from '../../api/ElementHandle.js';
import {KeyboardTypeOptions, KeyPressOptions} from '../../api/Input.js';
import {assert} from '../../util/assert.js';
import {KeyInput} from '../USKeyboardLayout.js';
import {debugError} from '../util.js';

import {Frame} from './Frame.js';
import {JSHandle as BidiJSHandle, JSHandle} from './JSHandle.js';
import {Realm} from './Realm.js';

/**
 * @internal
 */
export class ElementHandle<
  ElementType extends Node = Element,
> extends BaseElementHandle<ElementType> {
  declare handle: JSHandle<ElementType>;
  #frame: Frame;

  constructor(
    realm: Realm,
    remoteValue: Bidi.Script.RemoteValue,
    frame: Frame
  ) {
    super(new JSHandle(realm, remoteValue));
    this.#frame = frame;
  }

  override get frame(): Frame {
    return this.#frame;
  }

  context(): Realm {
    return this.handle.context();
  }

  get isPrimitiveValue(): boolean {
    return this.handle.isPrimitiveValue;
  }

  remoteValue(): Bidi.Script.RemoteValue {
    return this.handle.remoteValue();
  }

  /**
   * @internal
   */
  assertElementHasWorld(): asserts this {
    // TODO: Should assert element has a Sandbox
    return;
  }

  override async autofill(data: AutofillData): Promise<void> {
    const client = this.#frame.context().cdpSession;
    const nodeInfo = await client.send('DOM.describeNode', {
      objectId: this.handle.id,
    });
    const fieldId = nodeInfo.node.backendNodeId;
    const frameId = this.#frame._id;
    await client.send('Autofill.trigger', {
      fieldId,
      frameId,
      card: data.creditCard,
    });
  }

  override async contentFrame(
    this: ElementHandle<HTMLIFrameElement>
  ): Promise<Frame>;
  override async contentFrame(): Promise<Frame | null> {
    const adoptedThis = await this.frame.isolatedRealm().adoptHandle(this);
    const handle = (await adoptedThis.evaluateHandle(element => {
      if (element instanceof HTMLIFrameElement) {
        return element.contentWindow;
      }
      return;
    })) as BidiJSHandle;
    void handle.dispose().catch(debugError);
    void adoptedThis.dispose().catch(debugError);
    const value = handle.remoteValue();
    if (value.type === 'window') {
      return this.frame.page().frame(value.value.context);
    }
    return null;
  }

  // ///////////////////
  // // Input methods //
  // ///////////////////
  override async click(
    this: ElementHandle<Element>,
    options?: Readonly<ClickOptions>
  ): Promise<void> {
    await this.scrollIntoViewIfNeeded();
    const {x = 0, y = 0} = options?.offset ?? {};
    const remoteValue = this.remoteValue();
    assert('sharedId' in remoteValue);
    return this.#frame.page().mouse.click(
      x,
      y,
      Object.assign({}, options, {
        origin: {
          type: 'element' as const,
          element: remoteValue as Bidi.Script.SharedReference,
        },
      })
    );
  }

  override async hover(this: ElementHandle<Element>): Promise<void> {
    await this.scrollIntoViewIfNeeded();
    const remoteValue = this.remoteValue();
    assert('sharedId' in remoteValue);
    return this.#frame.page().mouse.move(0, 0, {
      origin: {
        type: 'element' as const,
        element: remoteValue as Bidi.Script.SharedReference,
      },
    });
  }

  override async tap(this: ElementHandle<Element>): Promise<void> {
    await this.scrollIntoViewIfNeeded();
    const remoteValue = this.remoteValue();
    assert('sharedId' in remoteValue);
    return this.#frame.page().touchscreen.tap(0, 0, {
      origin: {
        type: 'element' as const,
        element: remoteValue as Bidi.Script.SharedReference,
      },
    });
  }

  override async touchStart(this: ElementHandle<Element>): Promise<void> {
    await this.scrollIntoViewIfNeeded();
    const remoteValue = this.remoteValue();
    assert('sharedId' in remoteValue);
    return this.#frame.page().touchscreen.touchStart(0, 0, {
      origin: {
        type: 'element' as const,
        element: remoteValue as Bidi.Script.SharedReference,
      },
    });
  }

  override async touchMove(this: ElementHandle<Element>): Promise<void> {
    await this.scrollIntoViewIfNeeded();
    const remoteValue = this.remoteValue();
    assert('sharedId' in remoteValue);
    return this.#frame.page().touchscreen.touchMove(0, 0, {
      origin: {
        type: 'element' as const,
        element: remoteValue as Bidi.Script.SharedReference,
      },
    });
  }

  override async touchEnd(this: ElementHandle<Element>): Promise<void> {
    await this.scrollIntoViewIfNeeded();
    await this.#frame.page().touchscreen.touchEnd();
  }

  override async type(
    text: string,
    options?: Readonly<KeyboardTypeOptions>
  ): Promise<void> {
    await this.focus();
    await this.#frame.page().keyboard.type(text, options);
  }

  override async press(
    key: KeyInput,
    options?: Readonly<KeyPressOptions>
  ): Promise<void> {
    await this.focus();
    await this.#frame.page().keyboard.press(key, options);
  }
}
