Feature: City assignment and shared spawns
  Scenario: City rosters allow one mayor and three recruits
    Given the BattleCity server is running
    When 5 players request to join city 0
    Then the first player is assigned as the mayor for city 0
    And the next 3 players are assigned as recruits for city 0
    And player 5 is assigned to a different city

  Scenario: Player spawn matches shared city coordinates
    Given the BattleCity server is running
    When a player enters the game in city 0
    Then the server places them at the shared spawn for city 0
    And the client spawn helper resolves the same coordinates for city 0
