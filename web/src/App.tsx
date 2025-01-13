import { useEffect, useState } from 'react';
import './App.css';
import './Sidebar.css';
import './Main.css';

import DevItem from './components/DevItem';
import DevForm from './components/DevForm';

type NewDeveloperInput = {
  github_username: string,
  techs: string,
  latitude: number,
  longitude: number,
}

function App() {
  const [devs, setDevs] = useState<any[]>([]);

  useEffect(() => {
    async function loadDevs() {
      const response = await fetch('http://localhost:7777/devs');

      const result = await response.json();

      setDevs(result);
    }

    loadDevs();
  }, []);

  async function handleAddDev(newDev: NewDeveloperInput) {
    console.debug("New dev information", newDev)

    const response = await fetch('http://localhost:7777/devs', {
      method: 'POST',
      body: JSON.stringify(newDev),
      headers: {
        'Content-type': 'application/json'
      }
    })

    if (!response.ok) {
      return;
    }

    const result = await response.json();

    setDevs([...devs, result]);
  }

  return (
    <div id="app">
      <aside>
        <strong>Cadastrar</strong>
        <DevForm onSubmit={handleAddDev} />
      </aside>

      <main>
        <ul>
          {devs.map((dev) => (
            <DevItem key={dev._id} dev={dev} />
          ))}
        </ul>
      </main>
    </div>
  );
}

export default App;
