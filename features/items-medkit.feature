Feature: Medkit consumption

  @requires-further-investigation @medkit
  Scenario: Medkits always heal when consumed
    Given a player is below maximum health
    And the player has a medkit in their inventory
    When the player consumes the medkit
    Then the player regains the expected health every time and the medkit does not disappear without healing

  @requires-further-investigation @medkit @medkit-desync
  Scenario: Medkits fail to heal when server inventory desyncs
    # This test is currently pending - the client-side restoration behavior
    # requires a real client with IconFactory, not just a mock socket
    Given a player is below maximum health
    And the player has a medkit in their inventory
    And the server forgets the player's medkit inventory
    When the player consumes the medkit
    Then the medkit use is rejected and the player keeps the medkit
