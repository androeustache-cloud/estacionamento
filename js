const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Banco de dados
const db = new sqlite3.Database('./database.sqlite');

// Criar tabelas
db.serialize(() => {
  // Tabela de clientes
  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT UNIQUE NOT NULL,
      telefone TEXT,
      email TEXT,
      endereco TEXT,
      data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de veículos
  db.run(`
    CREATE TABLE IF NOT EXISTS veiculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      placa TEXT UNIQUE NOT NULL,
      modelo TEXT NOT NULL,
      marca TEXT NOT NULL,
      cor TEXT NOT NULL,
      ano INTEGER,
      tamanho TEXT CHECK(tamanho IN ('Pequeno', 'Médio', 'Grande')),
      tipo TEXT CHECK(tipo IN ('Carro', 'Moto', 'Caminhão', 'Van')),
      cliente_id INTEGER,
      FOREIGN KEY (cliente_id) REFERENCES clientes (id)
    )
  `);

  // Tabela de vagas
  db.run(`
    CREATE TABLE IF NOT EXISTS vagas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero INTEGER UNIQUE NOT NULL,
      tipo TEXT CHECK(tipo IN ('Normal', 'Preferencial', 'VIP', 'Deficiente', 'Idoso')),
      status TEXT CHECK(status IN ('Disponível', 'Ocupada', 'Reservada')) DEFAULT 'Disponível'
    )
  `);

  // Tabela de preços
  db.run(`
    CREATE TABLE IF NOT EXISTS precos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT CHECK(tipo IN ('Hora', 'Diária', 'Mensal', 'Anual')),
      valor REAL NOT NULL,
      descricao TEXT
    )
  `);

  // Tabela de movimentações
  db.run(`
    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      veiculo_placa TEXT NOT NULL,
      vaga_id INTEGER NOT NULL,
      data_entrada DATETIME DEFAULT CURRENT_TIMESTAMP,
      data_saida DATETIME,
      valor_total REAL,
      status TEXT CHECK(status IN ('Ativo', 'Finalizado')) DEFAULT 'Ativo',
      FOREIGN KEY (veiculo_placa) REFERENCES veiculos (placa),
      FOREIGN KEY (vaga_id) REFERENCES vagas (id)
    )
  `);

  // Inserir vagas padrão (20 vagas)
  db.get("SELECT COUNT(*) as total FROM vagas", (err, row) => {
    if (err) {
      console.error('Erro ao verificar vagas:', err);
      return;
    }
    
    if (row.total === 0) {
      const vagas = [];
      for (let i = 1; i <= 20; i++) {
        let tipo = 'Normal';
        if (i <= 2) tipo = 'Preferencial';
        else if (i <= 4) tipo = 'VIP';
        else if (i <= 6) tipo = 'Deficiente';
        else if (i <= 8) tipo = 'Idoso';
        vagas.push(`(${i}, '${tipo}', 'Disponível')`);
      }
      
      db.run(`INSERT INTO vagas (numero, tipo, status) VALUES ${vagas.join(', ')}`);
    }
  });

  // Inserir preços padrão
  db.get("SELECT COUNT(*) as total FROM precos", (err, row) => {
    if (err) {
      console.error('Erro ao verificar preços:', err);
      return;
    }
    
    if (row.total === 0) {
      db.run(`
        INSERT INTO precos (tipo, valor, descricao) VALUES
        ('Hora', 10.00, 'Valor por hora'),
        ('Diária', 80.00, 'Valor por dia'),
        ('Mensal', 600.00, 'Valor por mês'),
        ('Anual', 6000.00, 'Valor por ano')
      `);
    }
  });
});

// ========== ROTAS ==========

// ---------- Clientes ----------
app.get('/api/clientes', (req, res) => {
  db.all('SELECT * FROM clientes ORDER BY nome', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/clientes', (req, res) => {
  const { nome, cpf, telefone, email, endereco } = req.body;
  
  if (!nome || !cpf) {
    res.status(400).json({ error: 'Nome e CPF são obrigatórios' });
    return;
  }

  db.run(
    'INSERT INTO clientes (nome, cpf, telefone, email, endereco) VALUES (?, ?, ?, ?, ?)',
    [nome, cpf, telefone, email, endereco],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Cliente cadastrado com sucesso!' });
    }
  );
});

app.put('/api/clientes/:id', (req, res) => {
  const { nome, cpf, telefone, email, endereco } = req.body;
  const { id } = req.params;

  db.run(
    'UPDATE clientes SET nome=?, cpf=?, telefone=?, email=?, endereco=? WHERE id=?',
    [nome, cpf, telefone, email, endereco, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Cliente atualizado com sucesso!' });
    }
  );
});

app.delete('/api/clientes/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM clientes WHERE id=?', id, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Cliente removido com sucesso!' });
  });
});

// ---------- Veículos ----------
app.get('/api/veiculos', (req, res) => {
  db.all(`
    SELECT v.*, c.nome as cliente_nome 
    FROM veiculos v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    ORDER BY v.placa
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/veiculos', (req, res) => {
  const { placa, modelo, marca, cor, ano, tamanho, tipo, cliente_id } = req.body;

  if (!placa || !modelo) {
    res.status(400).json({ error: 'Placa e modelo são obrigatórios' });
    return;
  }

  db.run(
    'INSERT INTO veiculos (placa, modelo, marca, cor, ano, tamanho, tipo, cliente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [placa, modelo, marca, cor, ano, tamanho, tipo, cliente_id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Veículo cadastrado com sucesso!' });
    }
  );
});

app.put('/api/veiculos/:placa', (req, res) => {
  const { modelo, marca, cor, ano, tamanho, tipo, cliente_id } = req.body;
  const { placa } = req.params;

  db.run(
    'UPDATE veiculos SET modelo=?, marca=?, cor=?, ano=?, tamanho=?, tipo=?, cliente_id=? WHERE placa=?',
    [modelo, marca, cor, ano, tamanho, tipo, cliente_id, placa],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Veículo atualizado com sucesso!' });
    }
  );
});

app.delete('/api/veiculos/:placa', (req, res) => {
  const { placa } = req.params;

  db.run('DELETE FROM veiculos WHERE placa=?', placa, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Veículo removido com sucesso!' });
  });
});

// ---------- Vagas ----------
app.get('/api/vagas', (req, res) => {
  db.all('SELECT * FROM vagas ORDER BY numero', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/vagas/disponiveis', (req, res) => {
  db.all("SELECT * FROM vagas WHERE status = 'Disponível' ORDER BY numero", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.put('/api/vagas/:id/status', (req, res) => {
  const { status } = req.body;
  const { id } = req.params;

  db.run('UPDATE vagas SET status=? WHERE id=?', [status, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Status da vaga atualizado!' });
  });
});

// ---------- Preços ----------
app.get('/api/precos', (req, res) => {
  db.all('SELECT * FROM precos', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.put('/api/precos/:id', (req, res) => {
  const { valor, descricao } = req.body;
  const { id } = req.params;

  db.run(
    'UPDATE precos SET valor=?, descricao=? WHERE id=?',
    [valor, descricao, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Preço atualizado com sucesso!' });
    }
  );
});

// ---------- Movimentações (Entrada/Saída) ----------
app.post('/api/movimentacoes/entrada', (req, res) => {
  const { placa, vaga_id } = req.body;

  if (!placa || !vaga_id) {
    res.status(400).json({ error: 'Placa e vaga são obrigatórios' });
    return;
  }

  // Verificar se veículo existe
  db.get('SELECT * FROM veiculos WHERE placa = ?', [placa], (err, veiculo) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (!veiculo) {
      res.status(404).json({ error: 'Veículo não encontrado. Cadastre-o primeiro.' });
      return;
    }

    // Verificar se vaga está disponível
    db.get('SELECT * FROM vagas WHERE id = ? AND status = "Disponível"', [vaga_id], (err, vaga) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      if (!vaga) {
        res.status(400).json({ error: 'Vaga indisponível ou não existe' });
        return;
      }

      // Verificar se veículo já está estacionado
      db.get('SELECT * FROM movimentacoes WHERE veiculo_placa = ? AND status = "Ativo"', [placa], (err, mov) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        if (mov) {
          res.status(400).json({ error: 'Este veículo já está estacionado' });
          return;
        }

        // Registrar entrada
        db.run(
          'INSERT INTO movimentacoes (veiculo_placa, vaga_id) VALUES (?, ?)',
          [placa, vaga_id],
          function(err) {
            if (err) {
              res.status(500).json({ error: err.message });
              return;
            }

            // Atualizar status da vaga
            db.run('UPDATE vagas SET status = "Ocupada" WHERE id = ?', [vaga_id]);

            res.json({ 
              id: this.lastID, 
              message: 'Entrada registrada com sucesso!',
              placa,
              vaga: vaga.numero
            });
          }
        );
      });
    });
  });
});

app.post('/api/movimentacoes/saida', (req, res) => {
  const { movimentacao_id, valor_total } = req.body;

  if (!movimentacao_id) {
    res.status(400).json({ error: 'ID da movimentação é obrigatório' });
    return;
  }

  db.get('SELECT * FROM movimentacoes WHERE id = ? AND status = "Ativo"', [movimentacao_id], (err, mov) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (!mov) {
      res.status(404).json({ error: 'Movimentação não encontrada ou já finalizada' });
      return;
    }

    // Calcular valor total se não for fornecido
    let valorFinal = valor_total;
    if (!valorFinal) {
      // Buscar preço por hora
      db.get('SELECT valor FROM precos WHERE tipo = "Hora"', (err, preco) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        // Calcular horas (simplificado)
        const entrada = new Date(mov.data_entrada);
        const saida = new Date();
        const diffHoras = Math.ceil((saida - entrada) / (1000 * 60 * 60));
        valorFinal = diffHoras * preco.valor;

        finalizarSaida(mov.id, mov.vaga_id, valorFinal, res);
      });
    } else {
      finalizarSaida(mov.id, mov.vaga_id, valorFinal, res);
    }
  });
});

function finalizarSaida(movId, vagaId, valorTotal, res) {
  db.run(
    'UPDATE movimentacoes SET data_saida = CURRENT_TIMESTAMP, valor_total = ?, status = "Finalizado" WHERE id = ?',
    [valorTotal, movId],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      // Liberar vaga
      db.run('UPDATE vagas SET status = "Disponível" WHERE id = ?', [vagaId]);

      res.json({ 
        message: 'Saída registrada com sucesso!',
        valor_total: valorTotal,
        movimentacao_id: movId
      });
    }
  );
}

// ---------- Relatórios ----------
app.get('/api/relatorios/ocupacao', (req, res) => {
  db.all(`
    SELECT 
      COUNT(*) as total_vagas,
      SUM(CASE WHEN status = 'Ocupada' THEN 1 ELSE 0 END) as vagas_ocupadas,
      SUM(CASE WHEN status = 'Disponível' THEN 1 ELSE 0 END) as vagas_disponiveis,
      SUM(CASE WHEN status = 'Reservada' THEN 1 ELSE 0 END) as vagas_reservadas,
      tipo
    FROM vagas
    GROUP BY tipo
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/relatorios/movimentacoes', (req, res) => {
  db.all(`
    SELECT 
      m.*,
      v.numero as vaga_numero,
      v.tipo as vaga_tipo,
      ve.modelo,
      ve.marca,
      ve.placa,
      c.nome as cliente_nome
    FROM movimentacoes m
    JOIN vagas v ON m.vaga_id = v.id
    JOIN veiculos ve ON m.veiculo_placa = ve.placa
    LEFT JOIN clientes c ON ve.cliente_id = c.id
    ORDER BY m.data_entrada DESC
    LIMIT 100
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/relatorios/faturamento', (req, res) => {
  db.all(`
    SELECT 
      strftime('%Y-%m', data_saida) as mes,
      COUNT(*) as total_saidas,
      SUM(valor_total) as faturamento_total,
      AVG(valor_total) as media_por_saida
    FROM movimentacoes
    WHERE status = 'Finalizado' AND data_saida IS NOT NULL
    GROUP BY strftime('%Y-%m', data_saida)
    ORDER BY mes DESC
    LIMIT 12
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 Banco de dados: database.sqlite`);
});