import { useEffect, useState } from 'react';
import './App.css';
import './Sidebar.css';
import './Main.css';

import DevItem from './components/DevItem';
import DevForm from './components/DevForm';
import { HttpClient } from './services/HttpClient';

const httpClient = new HttpClient();

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
      const response = await httpClient.request<any[]>({ path: 'devs' });
      setDevs(response.body);
    }

    loadDevs();
  }, []);

  async function handleAddDev(newDev: NewDeveloperInput) {
    console.debug("New dev information", newDev)

    try {
      const response = await httpClient.request<any>({
        path: 'devs',
        method: 'POST',
        body: newDev
      });

      setDevs([...devs, response.body]);
    } catch (error) {
      console.error("Failed to add dev", error);
    }
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
            <DevItem key={dev.id} dev={dev} />
          ))}
        </ul>
      </main>
    </div>
  );
}

export default App;
