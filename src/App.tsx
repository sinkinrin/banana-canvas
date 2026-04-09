/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Canvas } from './components/Canvas';
import { ApiKeyCheck } from './components/ApiKeyCheck';

export default function App() {
  return (
    <ApiKeyCheck>
      <div className="w-full h-screen overflow-hidden">
        <Canvas />
      </div>
    </ApiKeyCheck>
  );
}
