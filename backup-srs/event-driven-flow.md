sequenceDiagram
    participant C as Client/Frontend
    participant W as Wallet
    participant AS as Auth Service
    participant GW as Game Gateway
    participant BS as Battle Service
    participant BE as Battle Engine
    participant DB as Database

    Note over C,DB: 1. AUTHENTICATION FLOW
    
    C->>W: Connect Wallet
    W-->>C: Wallet Connected (publicKey)
    C->>AS: GET /auth/nonce?publicKey={key}
    AS->>AS: Generate nonce + store in memory
    AS-->>C: { nonce }
    C->>W: Sign message with nonce
    W-->>C: Signature
    C->>AS: POST /auth/authenticate { publicKey, signature, message }
    AS->>AS: Verify signature with nonce
    AS->>DB: Find or create user
    DB-->>AS: User data
    AS->>AS: Generate JWT token
    AS-->>C: { token, user }
    C->>C: Store token in auth context

    Note over C,DB: 2. WEBSOCKET CONNECTION
    
    C->>GW: Connect WebSocket with auth token
    GW->>GW: Verify JWT token
    GW->>DB: Fetch user by token payload
    DB-->>GW: User data
    GW->>GW: Store user in socket context
    GW-->>C: 'connected' event { user }

    Note over C,DB: 3. LOBBY JOIN
    
    C->>GW: 'joinLobby' event
    GW->>GW: Add socket to 'lobby' room
    GW->>GW: Get current lobby users
    GW-->>C: 'lobbyState' event { users }
    GW-->>C: 'userJoinedLobby' event to others

    Note over C,DB: 4. MATCHMAKING
    
    C->>GW: 'findMatch' event
    GW->>GW: Check for waiting players
    alt No waiting players
        GW->>GW: Add to 'matchmaking' room
        GW-->>C: 'searchingMatch' event
    else Match found
        GW->>GW: Create battle room
        GW->>GW: Remove both from matchmaking
        GW->>BS: createBattle(player1, player2)
        BS->>DB: Fetch player creatures
        DB-->>BS: Creatures data
        BS->>BS: Initialize battle state
        BS->>DB: Save battle to database
        DB-->>BS: Battle saved
        BS-->>GW: Battle state
        GW-->>C: 'matchFound' event { battleId, players }
        GW-->>C: 'matchFound' event to opponent
    end

    Note over C,DB: 5. BATTLE EXECUTION
    
    C->>GW: 'battleAction' event { battleId, action }
    GW->>BS: processBattleAction(battleId, playerId, action)
    BS->>BE: processAction(battleState, playerId, action)
    BE->>BE: Validate action
    BE->>BE: Execute battle logic
    BE->>BE: Update battle state
    BE-->>BS: Updated battle state
    BS->>DB: Update battle in database
    DB-->>BS: Battle updated
    BS-->>GW: Updated battle state
    GW-->>C: 'battleStateUpdate' event (to both players)
    
    Note over C,DB: 6. BATTLE COMPLETION
    
    alt Battle ends
        BE->>BE: Set battle as complete
        BE->>BE: Determine winner
        BS->>BS: Calculate rewards
        BS->>DB: Update user experience/coins
        DB-->>BS: Updates applied
        BS->>BS: Clean up battle state
        GW-->>C: 'battleEnded' event { result }
        C->>C: Show battle results
        C->>C: Return to lobby
    end